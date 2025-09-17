// backend/routes/asistencia.js
import { Router } from "express";
import PDFDocument from "pdfkit";
import { pool } from "../db.js";
// import { requireAuth } from "../middleware/auth.js"; // <- Descomenta si usas auth

const router = Router();

/** 1=Lunes .. 7=Domingo, calculado por fecha YYYY-MM-DD */
function diaIdDesdeFecha(fecha) {
  const d = new Date(fecha + "T00:00:00");
  const dow = d.getDay(); // 0..6 (0=Dom)
  return dow === 0 ? 7 : dow;
}

/* =====================================================
   HORARIOS DISPONIBLES POR SEDE Y FECHA (DÍA SEMANAL)
   GET /api/asistencia/horarios?sedeId=&fecha=YYYY-MM-DD
===================================================== */
router.get("/horarios", /*requireAuth,*/ async (req, res) => {
  try {
    const { sedeId, fecha } = req.query;
    if (!sedeId || !fecha) return res.status(400).json({ ok:false, msg:"Falta sedeId o fecha" });

    const diaId = diaIdDesdeFecha(fecha);

    const [rows] = await pool.query(
      `
      SELECT hd.Id_Horarios_dias AS id, h.Hora_inicio, h.Hora_fin
      FROM Horarios_has_Dias hd
      JOIN Horarios h ON h.idHorarios = hd.Horarios_idHorarios
      WHERE hd.Dias_idDias = ?
        AND hd.Sedes_idSedes = ?
      ORDER BY h.Hora_inicio
      `,
      [Number(diaId), Number(sedeId)]
    );

    const data = rows.map(r => ({
      id: r.id,
      label: `${String(r.Hora_inicio).slice(0,5)} - ${String(r.Hora_fin).slice(0,5)}`
    }));

    res.json({ ok:true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error listando horarios" });
  }
});

/* =====================================================
   ALUMNOS INSCRITOS EN ESE HORARIO (CON ESTADO DEL DÍA)
   GET /api/asistencia/alumnos?sedeId=&fecha=&horarioId=
===================================================== */
router.get("/alumnos", /*requireAuth,*/ async (req, res) => {
  try {
    const { sedeId, fecha, horarioId } = req.query;
    if (!sedeId || !fecha || !horarioId)
      return res.status(400).json({ ok:false, msg:"Falta sedeId, fecha o horarioId" });

    // Trae SOLO los alumnos inscritos a ese (sedeId, horarioId), y su estado ese día.
    const [rows] = await pool.query(
      `
      SELECT
        p.idPersonas,
        CONCAT(p.Primer_nombre,' ',p.Primer_apellido) AS alumno,
        COALESCE(c.Asistencia_idAsistencia, 0) AS estadoId,
        c.Observaciones
      FROM Personas_Horarios ph
      JOIN Personas p
        ON p.idPersonas = ph.Personas_idPersonas
      LEFT JOIN Clases c
        ON c.Personas_idPersonas = p.idPersonas
       AND c.Sedes_idSedes = ph.Sedes_idSedes
       AND c.Fecha = ?
       AND c.Horarios_has_Dias_Id_Horarios_dias = ph.Horarios_has_Dias_Id_Horarios_dias
      WHERE ph.Sedes_idSedes = ?
        AND ph.Horarios_has_Dias_Id_Horarios_dias = ?
      ORDER BY alumno
      `,
      [fecha, Number(sedeId), Number(horarioId)]
    );

    res.json({ ok:true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error listando alumnos" });
  }
});

/* =====================================================
   GUARDAR/ACTUALIZAR ASISTENCIA (LOTE)
   POST /api/asistencia/marcar-multiple
   body: {
     sedeId, fecha, horarioId,
     items: [{ personaId, estado, observaciones }] // estado: 'A'|'J'|'F'
   }
===================================================== */
router.post("/marcar-multiple", /*requireAuth,*/ async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { sedeId, fecha, horarioId, items } = req.body || {};
    if (!sedeId || !fecha || !horarioId || !Array.isArray(items) || !items.length)
      return res.status(400).json({ ok:false, msg:"Faltan datos (sedeId, fecha, horarioId, items[])" });

    const mapEstado = (s) => (s === "A" ? 1 : s === "J" ? 2 : 0); // A=Asistió(1), J=Justificado(2), Faltó(0)
    const RUTINA_EJ = 1; // tu FK fija

    await conn.beginTransaction();

    for (const it of items) {
      const personaId = Number(it.personaId);
      if (!personaId) continue;
      const estadoId = mapEstado(String(it.estado || "F").toUpperCase());
      const obs = it.observaciones?.trim() || null;

      // Upsert simple por combinación (persona, sede, fecha, horario)
      const [exist] = await conn.query(
        `SELECT idClases
           FROM Clases
          WHERE Personas_idPersonas=? AND Sedes_idSedes=? AND Fecha=? AND Horarios_has_Dias_Id_Horarios_dias=?
          LIMIT 1`,
        [personaId, Number(sedeId), fecha, Number(horarioId)]
      );

      if (exist.length) {
        await conn.query(
          `UPDATE Clases
              SET Asistencia_idAsistencia=?, Observaciones=?
            WHERE idClases=?`,
          [estadoId, obs, exist[0].idClases]
        );
      } else {
        await conn.query(
          `INSERT INTO Clases
            (Personas_idPersonas, Sedes_idSedes, Asistencia_idAsistencia,
             Fecha, Observaciones, Horarios_has_Dias_Id_Horarios_dias,
             Rutina_has_Ejercicios_Id_Rutina_Ejercicioscol)
           VALUES (?,?,?,?,?,?,?)`,
          [personaId, Number(sedeId), estadoId, fecha, obs, Number(horarioId), RUTINA_EJ]
        );
      }
    }

    await conn.commit();
    res.json({ ok:true, msg:"Asistencia guardada" });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch {}
    res.status(500).json({ ok:false, msg:"Error guardando asistencia" });
  } finally {
    conn.release();
  }
});

/* =====================================================
   RESUMEN (opcionalmente por rango y/o horario)
   GET /api/asistencia/resumen?sedeId=&desde=&hasta=&horarioId=
===================================================== */
router.get("/resumen", /*requireAuth,*/ async (req, res) => {
  try {
    const { sedeId, desde, hasta, horarioId } = req.query;
    if (!sedeId) return res.status(400).json({ ok:false, msg:"Falta sedeId" });

    const params = [Number(sedeId)];
    let where = "c.Sedes_idSedes=?";
    if (desde)     { where += " AND c.Fecha >= ?"; params.push(desde); }
    if (hasta)     { where += " AND c.Fecha <= ?"; params.push(hasta); }
    if (horarioId) { where += " AND c.Horarios_has_Dias_Id_Horarios_dias = ?"; params.push(Number(horarioId)); }

    const [rows] = await pool.query(
      `SELECT a.idAsistencia AS estadoId, a.Descripcion_Estado AS estado, COUNT(*) total
         FROM Clases c
         JOIN Asistencia a ON a.idAsistencia = c.Asistencia_idAsistencia
        WHERE ${where}
        GROUP BY a.idAsistencia, a.Descripcion_Estado
        ORDER BY a.idAsistencia`,
      params
    );

    const total = rows.reduce((acc, r) => acc + r.total, 0);
    const data = rows.map(r => ({ ...r, porcentaje: total ? +(r.total * 100 / total).toFixed(1) : 0 }));
    res.json({ ok:true, total, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error en resumen" });
  }
});

/* =====================================================
   PDF DEL DÍA PARA EL HORARIO
   GET /api/asistencia/pdf?sedeId=&fecha=&horarioId=
===================================================== */
router.get("/pdf", /*requireAuth,*/ async (req, res) => {
  try {
    const { sedeId, fecha, horarioId } = req.query;
    if (!sedeId || !fecha || !horarioId)
      return res.status(400).json({ ok:false, msg:"Falta sedeId, fecha o horarioId" });

    // Cabecera: sede + rango horario
    const [[cab]] = await pool.query(
      `SELECT s.Nombre AS sede, h.Hora_inicio, h.Hora_fin
         FROM Sedes s
         JOIN Horarios_has_Dias hd ON hd.Id_Horarios_dias = ?
         JOIN Horarios h ON h.idHorarios = hd.Horarios_idHorarios
        WHERE s.idSedes = ?
        LIMIT 1`,
      [Number(horarioId), Number(sedeId)]
    );

    // Alumnos del horario con estado del día (default 0 si no hay registro)
    const [rows] = await pool.query(
      `
      SELECT
        p.idPersonas,
        CONCAT(p.Primer_nombre,' ',p.Primer_apellido) AS alumno,
        COALESCE(c.Asistencia_idAsistencia, 0) AS estadoId
      FROM Personas_Horarios ph
      JOIN Personas p
        ON p.idPersonas = ph.Personas_idPersonas
      LEFT JOIN Clases c
        ON c.Personas_idPersonas = p.idPersonas
       AND c.Sedes_idSedes = ph.Sedes_idSedes
       AND c.Fecha = ?
       AND c.Horarios_has_Dias_Id_Horarios_dias = ph.Horarios_has_Dias_Id_Horarios_dias
      WHERE ph.Sedes_idSedes = ?
        AND ph.Horarios_has_Dias_Id_Horarios_dias = ?
      ORDER BY alumno
      `,
      [fecha, Number(sedeId), Number(horarioId)]
    );

    const asistentes   = rows.filter(r => r.estadoId === 1).map(r => r.alumno);
    const justificados = rows.filter(r => r.estadoId === 2).map(r => r.alumno);
    const faltantes    = rows.filter(r => r.estadoId === 0).map(r => r.alumno);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="asistencia_${sedeId}_${fecha}_h${horarioId}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: "LETTER" });
    doc.pipe(res);

    // Header rojo
    doc.rect(0, 0, doc.page.width, 48).fill("#c62828");
    doc.fill("#fff").fontSize(14).text("Marroquín´s Team Kenpo Karate", 36, 16);
    doc.fill("#000").moveDown(1.5);

    const etiquetaHorario = cab?.Hora_inicio
      ? `${String(cab.Hora_inicio).slice(0,5)} - ${String(cab.Hora_fin).slice(0,5)}`
      : "—";

    doc.fontSize(16).text(`Asistencia — ${cab?.sede || "Sede"} — ${fecha} — ${etiquetaHorario}`);
    doc.moveDown(0.75);

    const section = (t, list) => {
      doc.fontSize(13).text(t, { underline: true });
      if (!list.length) { doc.moveDown(0.2).fontSize(11).text("— Ninguno —"); }
      else list.forEach((nm, i) => doc.fontSize(11).text(`${i+1}. ${nm}`));
      doc.moveDown(0.6);
    };

    section("Asistentes",   asistentes);
    section("Justificados", justificados);
    section("Faltantes",    faltantes);

    doc.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error generando PDF" });
  }
});

export default router;
