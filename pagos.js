// backend/routes/pagos.js
import express from "express";
import { pool } from "../db.js";          // ← igual que usaste antes
import dayjs from "dayjs";
import PDFDocument from "pdfkit";     // ← para exportar PDF

const router = express.Router();

// ===================== Config =====================
const MONTO_MENSUALIDAD = 200;
const MONTO_PLAYERA = 60;
const SEDES_ANTIGUA = new Set([3, 4, 5]); // Antigua no paga mensualidad

// ===================== Helpers =====================
function monthName(m) {
  return [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ][m];
}

async function alumnosPorSede(sedeId) {
  const [rows] = await pool.query(
    `SELECT p.idPersonas,
            CONCAT_WS(' ', p.Primer_nombre, p.Segundo_nombre, p.Primer_apellido, p.Segundo_apellido) AS alumno
       FROM Personas p
       JOIN Personas_Roles pr ON pr.Personas_idPersonas = p.idPersonas AND pr.Roles_idRoles = 6
      WHERE p.Sedes_idSedes = ?
      ORDER BY p.Primer_nombre, p.Primer_apellido`,
    [sedeId]
  );
  return rows.map(r => ({ ...r, alumno: (r.alumno || "").trim().replace(/\s+/g, " ") }));
}

// ===================== Asegurar tablas extra (playeras + uniformes) =====================
async function ensureExtraTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Pagos_playera (
      idPagos_playera INT AUTO_INCREMENT PRIMARY KEY,
      Personas_idPersonas INT NOT NULL,
      Playeras_idPlayeras INT NOT NULL,
      Fecha DATE NOT NULL,
      Monto DECIMAL(10,2) NOT NULL DEFAULT 60,
      Cantidad INT NOT NULL DEFAULT 1,
      Estado TINYINT NOT NULL DEFAULT 1,
      INDEX (Personas_idPersonas),
      INDEX (Playeras_idPlayeras)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Pagos_uniforme (
      idPagos_uniforme INT AUTO_INCREMENT PRIMARY KEY,
      Personas_idPersonas INT NOT NULL,
      Fecha DATE NOT NULL,
      Monto DECIMAL(10,2) NOT NULL,
      Detalle VARCHAR(120) NULL,
      Estado TINYINT NOT NULL DEFAULT 1,
      INDEX (Personas_idPersonas)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
ensureExtraTables().catch(console.error);

// ===================== Catálogos =====================
router.get("/catalogos", async (_req, res) => {
  try {
    const [sedes] = await pool.query(`SELECT idSedes, Nombre FROM Sedes ORDER BY idSedes`);
    const [playeras] = await pool.query(`
      SELECT pl.idPlayeras, pl.Descripcion, tl.Medida
        FROM Playeras pl
        JOIN Talla_Letra tl ON tl.idTalla_Letra = pl.Talla_Letra_idTalla_Letra
       ORDER BY pl.Descripcion, tl.Medida
    `);
    res.json({ ok: true, data: { sedes, playeras } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error obteniendo catálogos" });
  }
});

// ===================== Mensualidad =====================
router.get("/mensualidad", async (req, res) => {
  try {
    const anio = Number(req.query.anio) || new Date().getFullYear();
    const sedeId = Number(req.query.sedeId) || 1;

    const alumnos = await alumnosPorSede(sedeId);
    const meses = [];
    if (!alumnos.length) {
      for (let m = 1; m <= 12; m++) meses.push({ mes: m, label: monthName(m), alumnos: [] });
      return res.json({ ok: true, anio, sedeId, meses, isAntigua: SEDES_ANTIGUA.has(sedeId) });
    }

    const ids = alumnos.map(a => a.idPersonas);
    const [pagos] = await pool.query(
      `SELECT ppm.Personas_idPersonas AS personaId,
              MONTH(pm.Fecha_pago) AS mes,
              pm.Monto, pm.Estado
         FROM Personas_Pagos_mensualidad ppm
         JOIN Pagos_mensualidad pm ON pm.idPagos=ppm.Pagos_mensualidad_idPagos
        WHERE YEAR(pm.Fecha_pago)=?
          AND ppm.Personas_idPersonas IN (${ids.map(() => "?").join(",")})`,
      [anio, ...ids]
    );
    const idx = new Map(pagos.map(p => [`${p.personaId}:${p.mes}`, p]));

    for (let m = 1; m <= 12; m++) {
      const lista = alumnos.map(a => {
        const hit = idx.get(`${a.idPersonas}:${m}`);
        return {
          idPersonas: a.idPersonas,
          alumno: a.alumno,
          pagado: hit ? Number(hit.Estado) === 1 : false,
          monto: hit ? Number(hit.Monto) : MONTO_MENSUALIDAD
        };
      });
      meses.push({ mes: m, label: monthName(m), alumnos: lista });
    }

    res.json({ ok: true, anio, sedeId, meses, isAntigua: SEDES_ANTIGUA.has(sedeId) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error mensualidad" });
  }
});

router.post("/mensualidad/guardar", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { anio, sedeId, cambios } = req.body || {};
    if (!anio || !Array.isArray(cambios)) {
      return res.status(400).json({ ok: false, msg: "Datos incompletos" });
    }
    if (SEDES_ANTIGUA.has(Number(sedeId))) {
      return res.json({ ok: true, msg: "Sedes de Antigua no registran mensualidad" });
    }

    await conn.beginTransaction();
    for (const c of cambios) {
      const mes = Number(c.mes);
      const personaId = Number(c.personaId);
      const pagado = !!c.pagado;
      const monto = Number(c.monto) || MONTO_MENSUALIDAD;

      const [[ex]] = await conn.query(
        `SELECT pm.idPagos
           FROM Personas_Pagos_mensualidad ppm
           JOIN Pagos_mensualidad pm ON pm.idPagos=ppm.Pagos_mensualidad_idPagos
          WHERE ppm.Personas_idPersonas=? AND YEAR(pm.Fecha_pago)=? AND MONTH(pm.Fecha_pago)=? LIMIT 1`,
        [personaId, anio, mes]
      );

      if (pagado) {
        if (ex) {
          await conn.query(`UPDATE Pagos_mensualidad SET Monto=?, Estado=1 WHERE idPagos=?`, [monto, ex.idPagos]);
        } else {
          const fecha = `${anio}-${String(mes).padStart(2, "0")}-01`;
          const [ins] = await conn.query(
            `INSERT INTO Pagos_mensualidad (Fecha_pago, Monto, Estado, Mora) VALUES (?,?,1,0)`,
            [fecha, monto]
          );
          await conn.query(
            `INSERT INTO Personas_Pagos_mensualidad (Personas_idPersonas, Pagos_mensualidad_idPagos) VALUES (?,?)`,
            [personaId, ins.insertId]
          );
        }
      } else {
        if (ex) await conn.query(`UPDATE Pagos_mensualidad SET Estado=0 WHERE idPagos=?`, [ex.idPagos]);
      }
    }
    await conn.commit();
    res.json({ ok: true, msg: "Mensualidad guardada" });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error guardando mensualidad" });
  } finally {
    conn.release();
  }
});

// Resumen mensual (para PDF)
router.get("/mensualidad/resumen", async (req, res) => {
  try {
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);
    const sedeId = Number(req.query.sedeId);
    if (!anio || !mes || !sedeId) return res.status(400).json({ ok:false, msg:"Faltan parámetros" });

    const alumnos = await alumnosPorSede(sedeId);
    const ids = alumnos.map(a=>a.idPersonas);
    if (!ids.length) return res.json({ ok:true, data:{ pagados:[], pendientes:[], total:0, totPagado:0, totPendiente:0 } });

    const [rows] = await pool.query(
      `SELECT ppm.Personas_idPersonas AS personaId, pm.Monto, pm.Estado
         FROM Personas_Pagos_mensualidad ppm
         JOIN Pagos_mensualidad pm ON pm.idPagos=ppm.Pagos_mensualidad_idPagos
        WHERE YEAR(pm.Fecha_pago)=? AND MONTH(pm.Fecha_pago)=? AND ppm.Personas_idPersonas IN (${ids.map(()=>"?").join(",")})`,
      [anio, mes, ...ids]
    );
    const byId = new Map(alumnos.map(a=>[a.idPersonas, a]));
    const pagados = [];
    const pendientes = [];
    let totPagado=0;
    let totPendiente=0;

    // armar estado por alumno
    for (const a of alumnos){
      const match = rows.find(r=>r.personaId===a.idPersonas && Number(r.Estado)===1);
      if (match){
        pagados.push({ alumno:a.alumno, monto:Number(match.Monto||MONTO_MENSUALIDAD) });
        totPagado += Number(match.Monto||MONTO_MENSUALIDAD);
      } else {
        pendientes.push({ alumno:a.alumno, monto:MONTO_MENSUALIDAD });
        totPendiente += MONTO_MENSUALIDAD;
      }
    }

    res.json({ ok:true, data:{ pagados, pendientes, total: alumnos.length, totPagado, totPendiente } });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, msg:"Error resumen mensualidad" });
  }
});

// PDF mensualidad
router.get("/mensualidad/pdf", async (req, res) => {
  try {
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);
    const sedeId = Number(req.query.sedeId);
    if (!anio || !mes || !sedeId) return res.status(400).send("Parámetros inválidos");

    // No aplica en Antigua
    if (SEDES_ANTIGUA.has(sedeId)) return res.status(400).send("Sedes de Antigua no generan mensualidad.");

    // nombre sede
    const [[sede]] = await pool.query(`SELECT Nombre FROM Sedes WHERE idSedes=?`, [sedeId]);
    const sedeNombre = sede?.Nombre || `Sede ${sedeId}`;

    // obtener resumen
    const r = await fetchLikeResumen(anio, mes, sedeId);
    const { pagados, pendientes, totPagado, totPendiente, total } = r;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="mensualidad_${sedeId}_${anio}-${String(mes).padStart(2,"0")}.pdf"`);

    const doc = new PDFDocument({ margin: 36 });
    doc.pipe(res);

    doc.fontSize(16).text("Reporte de Mensualidades", { align:"center" });
    doc.moveDown(0.4);
    doc.fontSize(11).text(`Sede: ${sedeNombre}`);
    doc.text(`Mes/Año: ${monthName(mes)} ${anio}`);
    doc.text(`Generado: ${dayjs().format("YYYY-MM-DD HH:mm")}`);
    doc.moveDown(0.8);

    // Pagados
    doc.fontSize(13).text("Pagados", {underline:true});
    doc.moveDown(0.25);
    if (!pagados.length) {
      doc.fontSize(10).text("— Ninguno —");
    } else {
      pagados.forEach((x,i)=> doc.fontSize(10).text(`${i+1}. ${x.alumno} — Q.${Number(x.monto).toFixed(2)}`));
    }
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Total pagado: Q.${Number(totPagado).toFixed(2)}`);
    doc.moveDown(1);

    // Pendientes
    doc.fontSize(13).text("Pendientes", {underline:true});
    doc.moveDown(0.25);
    if (!pendientes.length) {
      doc.fontSize(10).text("— Ninguno —");
    } else {
      pendientes.forEach((x,i)=> doc.fontSize(10).text(`${i+1}. ${x.alumno} — Q.${Number(x.monto).toFixed(2)}`));
    }
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Total pendiente: Q.${Number(totPendiente).toFixed(2)}`);
    doc.moveDown(1);

    doc.fontSize(11).text(`Alumnos totales en sede: ${total}`);
    doc.end();
  } catch (e) {
    console.error(e);
    res.status(500).send("Error generando PDF");
  }

  async function fetchLikeResumen(anio, mes, sedeId){
    const alumnos = await alumnosPorSede(sedeId);
    const ids = alumnos.map(a=>a.idPersonas);
    if (!ids.length) return { pagados:[], pendientes:[], totPagado:0, totPendiente:0, total:0 };

    const [rows] = await pool.query(
      `SELECT ppm.Personas_idPersonas AS personaId, pm.Monto, pm.Estado
         FROM Personas_Pagos_mensualidad ppm
         JOIN Pagos_mensualidad pm ON pm.idPagos=ppm.Pagos_mensualidad_idPagos
        WHERE YEAR(pm.Fecha_pago)=? AND MONTH(pm.Fecha_pago)=? AND ppm.Personas_idPersonas IN (${ids.map(()=>"?").join(",")})`,
      [anio, mes, ...ids]
    );

    const pagados = []; const pendientes=[]; let totPagado=0; let totPendiente=0;
    for (const a of alumnos){
      const real = rows.find(r=>r.personaId===a.idPersonas && Number(r.Estado)===1);
      if (real){
        const m = Number(real.Monto||MONTO_MENSUALIDAD);
        pagados.push({ alumno:a.alumno, monto:m });
        totPagado += m;
      } else {
        pendientes.push({ alumno:a.alumno, monto:MONTO_MENSUALIDAD });
        totPendiente += MONTO_MENSUALIDAD;
      }
    }
    return { pagados, pendientes, totPagado, totPendiente, total: alumnos.length };
  }
});

// ===================== Exámenes =====================
router.get("/examenes", async (req, res) => {
  try {
    const desde = req.query.desde || dayjs().startOf("month").format("YYYY-MM-DD");
    const hasta = req.query.hasta || dayjs().endOf("month").format("YYYY-MM-DD");
    const sedeId = Number(req.query.sedeId) || 1;

    const [rows] = await pool.query(
      `SELECT pe.idPagos_examen AS idPago, pe.Fecha, pe.Monto, pe.Descripcion, pe.Estado,
              p.idPersonas, CONCAT_WS(' ',p.Primer_nombre,p.Segundo_nombre,p.Primer_apellido,p.Segundo_apellido) AS alumno
         FROM Pagos_examen pe
         JOIN Personas_Pagos_examen ppe ON ppe.Pagos_examen_idPagos_examen = pe.idPagos_examen
         JOIN Personas p ON p.idPersonas = ppe.Personas_idPersonas
        WHERE pe.Fecha BETWEEN ? AND ? AND p.Sedes_idSedes = ?
        ORDER BY pe.Fecha DESC, p.Primer_nombre`,
      [desde, hasta, sedeId]
    );

    res.json({ ok: true, data: rows.map(r => ({ ...r, alumno: (r.alumno || "").trim().replace(/\s+/g, " ") })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error listando exámenes" });
  }
});

router.post("/examenes/registrar", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { personaId, fecha, monto, descripcion, estado } = req.body || {};
    if (!personaId || !fecha || !monto) return res.status(400).json({ ok: false, msg: "Datos incompletos" });

    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO Pagos_examen (Monto, Descripcion, Estado, Fecha) VALUES (?,?,?,?)`,
      [Number(monto), descripcion || "", Number(estado ?? 1), fecha]
    );
    await conn.query(
      `INSERT INTO Personas_Pagos_examen (Personas_idPersonas, Pagos_examen_idPagos_examen) VALUES (?,?)`,
      [Number(personaId), ins.insertId]
    );
    await conn.commit();
    res.json({ ok: true, msg: "Pago de examen registrado" });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error registrando examen" });
  } finally {
    conn.release();
  }
});

// ===================== Playeras (MTK gris Q60) =====================
router.get("/playeras", async (req, res) => {
  try {
    const desde = req.query.desde || dayjs().startOf("month").format("YYYY-MM-DD");
    const hasta = req.query.hasta || dayjs().endOf("month").format("YYYY-MM-DD");
    const sedeId = Number(req.query.sedeId) || 1;

    const [rows] = await pool.query(
      `SELECT pg.idPagos_playera AS idPago, pg.Fecha, pg.Monto, pg.Cantidad, pg.Estado,
              per.idPersonas, CONCAT_WS(' ',per.Primer_nombre,per.Segundo_nombre,per.Primer_apellido,per.Segundo_apellido) AS alumno,
              pl.idPlayeras, pl.Descripcion, tl.Medida
         FROM Pagos_playera pg
         JOIN Personas per ON per.idPersonas = pg.Personas_idPersonas
         JOIN Playeras pl  ON pl.idPlayeras  = pg.Playeras_idPlayeras
         JOIN Talla_Letra tl ON tl.idTalla_Letra = pl.Talla_Letra_idTalla_Letra
        WHERE pg.Fecha BETWEEN ? AND ? AND per.Sedes_idSedes = ?
        ORDER BY pg.Fecha DESC, per.Primer_nombre`,
      [desde, hasta, sedeId]
    );

    res.json({ ok: true, data: rows.map(r => ({ ...r, alumno: (r.alumno || "").trim().replace(/\s+/g, " ") })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error listando playeras" });
  }
});

router.post("/playeras/registrar", async (req, res) => {
  try {
    const { personaId, fecha, idPlayera, cantidad, estado } = req.body || {};
    if (!personaId || !fecha || !idPlayera) return res.status(400).json({ ok: false, msg: "Datos incompletos" });

    await pool.query(
      `INSERT INTO Pagos_playera (Personas_idPersonas, Playeras_idPlayeras, Fecha, Monto, Cantidad, Estado)
       VALUES (?,?,?,?,?,?)`,
      [Number(personaId), Number(idPlayera), fecha, MONTO_PLAYERA, Number(cantidad || 1), Number(estado ?? 1)]
    );
    res.json({ ok: true, msg: "Pago de playera registrado" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error registrando playera" });
  }
});

// ===================== Uniformes (habilitado) =====================
router.get("/uniformes", async (req, res) => {
  try {
    const desde = req.query.desde || dayjs().startOf("month").format("YYYY-MM-DD");
    const hasta = req.query.hasta || dayjs().endOf("month").format("YYYY-MM-DD");
    const sedeId = Number(req.query.sedeId) || 1;

    const [rows] = await pool.query(
      `SELECT u.idPagos_uniforme AS idPago, u.Fecha, u.Monto, u.Detalle, u.Estado,
              p.idPersonas, CONCAT_WS(' ',p.Primer_nombre,p.Segundo_nombre,p.Primer_apellido,p.Segundo_apellido) AS alumno
         FROM Pagos_uniforme u
         JOIN Personas p ON p.idPersonas = u.Personas_idPersonas
        WHERE u.Fecha BETWEEN ? AND ? AND p.Sedes_idSedes=?
        ORDER BY u.Fecha DESC, p.Primer_nombre`,
      [desde, hasta, sedeId]
    );

    res.json({ ok: true, data: rows.map(r => ({ ...r, alumno: (r.alumno || "").trim().replace(/\s+/g, " ") })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error listando uniformes" });
  }
});

router.post("/uniformes/registrar", async (req, res) => {
  try {
    const { personaId, fecha, monto, detalle, estado } = req.body || {};
    if (!personaId || !fecha || !monto) return res.status(400).json({ ok: false, msg: "Datos incompletos" });

    await pool.query(
      `INSERT INTO Pagos_uniforme (Personas_idPersonas, Fecha, Monto, Detalle, Estado)
       VALUES (?,?,?,?,?)`,
      [Number(personaId), fecha, Number(monto), (detalle || null), Number(estado ?? 1)]
    );
    res.json({ ok: true, msg: "Pago de uniforme registrado" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Error registrando uniforme" });
  }
});

export default router;
