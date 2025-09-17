// backend/routes/alumnos.js
import { Router } from "express";
import { pool } from "../db.js";
// import { requireAuth } from "../middleware/auth.js"; // si lo usas, descomenta

const router = Router();

/* ========================= Helpers ========================= */
function toISODate(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;                  // YYYY-MM-DD
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);              // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

async function horarioPerteneceASede(conn, horarioId, sedeId) {
  const [[row]] = await conn.query(
    `SELECT 1 AS ok
       FROM Horarios_has_Dias
      WHERE Id_Horarios_dias=? AND Sedes_idSedes=? LIMIT 1`,
    [Number(horarioId), Number(sedeId)]
  );
  return !!row;
}

async function cintaDeProgramaValida(conn, cintaId, programaId) {
  const [[row]] = await conn.query(
    `SELECT 1 AS ok
       FROM Cinta
      WHERE idCinta=? AND Programa_idPrograma=? LIMIT 1`,
    [Number(cintaId), Number(programaId)]
  );
  return !!row;
}

async function primeraCintaDePrograma(conn, programaId) {
  const [[row]] = await conn.query(
    `SELECT idCinta
       FROM Cinta
      WHERE Programa_idPrograma=?
      ORDER BY idCinta ASC
      LIMIT 1`,
    [Number(programaId)]
  );
  return row?.idCinta || null;
}

function pickPersonaSet(obj = {}) {
  return [
    obj.Primer_nombre ?? null,
    obj.Segundo_nombre ?? null,
    obj.Primer_apellido ?? null,
    obj.Segundo_apellido ?? null,
    obj.Telefono ?? null,
    obj.Persona_emergencia ?? null,
    obj.Contacto_emergencia ?? null,
    obj.Edad ?? null,
    obj.Fecha_nac ?? null,
    obj.Año_inicio ?? null,
    obj.Sedes_idSedes ?? null,
    obj.Generos_idGeneros ?? null,
    obj.Ropa_personas_idRopa_personas ?? 1,
  ];
}

/* ========================= Catálogos ========================= */
// GET /api/alumnos/catalogos
router.get("/catalogos", /*requireAuth,*/ async (_req, res) => {
  try {
    const [sedes]     = await pool.query(`SELECT idSedes, Nombre FROM Sedes ORDER BY Nombre`);
    const [generos]   = await pool.query(`SELECT idGeneros, Descripcion FROM Generos ORDER BY Descripcion`);
    const [programas] = await pool.query(`SELECT idPrograma, Descripcion FROM Programa ORDER BY idPrograma`);
    const [cintas]    = await pool.query(
      `SELECT c.idCinta, c.Color, c.Programa_idPrograma
         FROM Cinta c
        ORDER BY c.Programa_idPrograma, c.idCinta`
    );
    res.json({ ok:true, data:{ sedes, generos, programas, cintas }});
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error catálogos" });
  }
});

/* ============ Horarios por sede (para el modal de alta/edición) ============ */
// GET /api/alumnos/horarios?sedeId=
router.get("/horarios", /*requireAuth,*/ async (req, res) => {
  try {
    const sedeId = Number(req.query.sedeId || 0);
    if (!sedeId) return res.status(400).json({ ok:false, msg:"Falta sedeId" });

    const [rows] = await pool.query(
      `SELECT hd.Id_Horarios_dias AS id,
              COALESCE(d.Descripcion, CONCAT('Día ', hd.Dias_idDias)) AS Dia,
              h.Hora_inicio, h.Hora_fin
         FROM Horarios_has_Dias hd
         JOIN Horarios h ON h.idHorarios = hd.Horarios_idHorarios
         LEFT JOIN Dias d ON d.idDias = hd.Dias_idDias
        WHERE hd.Sedes_idSedes = ?
        ORDER BY hd.Dias_idDias, h.Hora_inicio`,
      [sedeId]
    );

    const data = rows.map(r => ({
      id: r.id,
      label: `${r.Dia} ${String(r.Hora_inicio).slice(0,5)} - ${String(r.Hora_fin).slice(0,5)}`
    }));
    res.json({ ok:true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error listando horarios" });
  }
});

/* ========================= Listado ========================= */
// GET /api/alumnos?q=&sedeId=&programaId=&cintaId=&edadMin=&edadMax=
router.get("/", /*requireAuth,*/ async (req, res) => {
  try {
    const q          = String(req.query.q || "").trim();
    const sedeId     = Number(req.query.sedeId || 0);
    const programaId = Number(req.query.programaId || 0);
    const cintaId    = Number(req.query.cintaId || 0);
    const edadMin    = Number(req.query.edadMin || 0);
    const edadMax    = Number(req.query.edadMax || 0);

    const where = [];
    const args  = [];

    if (q) {
      where.push(`(p.Primer_nombre LIKE ? OR p.Primer_apellido LIKE ? OR p.Segundo_nombre LIKE ? OR p.Segundo_apellido LIKE ?)`);
      args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (sedeId) { where.push(`p.Sedes_idSedes=?`); args.push(sedeId); }
    if (edadMin) { where.push(`COALESCE(p.Edad,0) >= ?`); args.push(edadMin); }
    if (edadMax) { where.push(`COALESCE(p.Edad,0) <= ?`); args.push(edadMax); }
    if (cintaId) {
      where.push(`cp.Cinta_idCinta=?`); args.push(cintaId);
    } else if (programaId) {
      where.push(`c.Programa_idPrograma=?`); args.push(programaId);
    }

    const [rows] = await pool.query(
      `
      SELECT
        p.idPersonas, p.Primer_nombre, p.Segundo_nombre, p.Primer_apellido, p.Segundo_apellido,
        p.Edad, s.Nombre AS Sede,
        c.idCinta, c.Color AS CintaColor,
        prog.idPrograma, prog.Descripcion AS Programa
      FROM Personas p
      LEFT JOIN Sedes s            ON s.idSedes = p.Sedes_idSedes
      LEFT JOIN Cinta_Personas cp  ON cp.Personas_idPersonas = p.idPersonas
      LEFT JOIN Cinta c            ON c.idCinta = cp.Cinta_idCinta
      LEFT JOIN Programa prog      ON prog.idPrograma = c.Programa_idPrograma
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p.Primer_apellido, p.Primer_nombre
      LIMIT 1000
      `,
      args
    );

    res.json({ ok:true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error listando alumnos" });
  }
});

/* ========================= Obtener por id ========================= */
// GET /api/alumnos/:id
router.get("/:id", /*requireAuth,*/ async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ ok:false, msg:"Id inválido" });

    const [[p]] = await pool.query(`SELECT * FROM Personas WHERE idPersonas=? LIMIT 1`, [id]);
    if (!p) return res.status(404).json({ ok:false, msg:"Alumno no encontrado" });

    const [[belt]] = await pool.query(
      `SELECT c.idCinta, c.Color, c.Programa_idPrograma, pr.Descripcion AS Programa
         FROM Cinta_Personas cp
         JOIN Cinta c     ON c.idCinta = cp.Cinta_idCinta
         JOIN Programa pr ON pr.idPrograma = c.Programa_idPrograma
        WHERE cp.Personas_idPersonas=? LIMIT 1`,
      [id]
    );

    const [hhs] = await pool.query(
      `SELECT ph.Horarios_has_Dias_Id_Horarios_dias AS horarioId,
              d.Descripcion AS Dia,
              h.Hora_inicio, h.Hora_fin
         FROM Personas_Horarios ph
         JOIN Horarios_has_Dias hd ON hd.Id_Horarios_dias = ph.Horarios_has_Dias_Id_Horarios_dias
         JOIN Horarios h ON h.idHorarios = hd.Horarios_idHorarios
         LEFT JOIN Dias d ON d.idDias = hd.Dias_idDias
        WHERE ph.Personas_idPersonas=?`,
      [id]
    );

    const persona = {
      idPersonas: p.idPersonas,
      Primer_nombre: p.Primer_nombre,
      Segundo_nombre: p.Segundo_nombre,
      Primer_apellido: p.Primer_apellido,
      Segundo_apellido: p.Segundo_apellido,
      Telefono: p.Telefono,
      Persona_emergencia: p.Persona_emergencia,
      Contacto_emergencia: p.Contacto_emergencia,
      Edad: p.Edad,
      Fecha_nac: p.Fecha_nac,
      Año_inicio: p.Año_inicio,
      Sedes_idSedes: p.Sedes_idSedes,
      Generos_idGeneros: p.Generos_idGeneros,
      Ropa_personas_idRopa_personas: p.Ropa_personas_idRopa_personas
    };

    res.json({ ok:true, data:{ persona, cinta: belt || null, horarios: hhs }});
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error obteniendo alumno" });
  }
});

/* ========================= Crear (con asignación inicial) ========================= */
// POST /api/alumnos
// body: { persona:{...}, asignacion:{ programaId, cintaId?, horarioId* } }
router.post("/", /*requireAuth,*/ async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { persona, asignacion } = req.body || {};
    if (!persona) { conn.release(); return res.status(400).json({ ok:false, msg:"Faltan datos de persona" }); }

    const oblig = ["Primer_nombre","Primer_apellido","Sedes_idSedes","Generos_idGeneros"];
    for (const c of oblig) if (!persona[c]) {
      conn.release(); return res.status(400).json({ ok:false, msg:`Falta ${c} en Persona` });
    }

    if (persona.Fecha_nac) persona.Fecha_nac = toISODate(persona.Fecha_nac);

    await conn.beginTransaction();

    const [pIns] = await conn.query(
      `INSERT INTO Personas (
        Primer_nombre, Segundo_nombre, Primer_apellido, Segundo_apellido, Telefono,
        Persona_emergencia, Contacto_emergencia, Edad, Fecha_nac, Año_inicio,
        Sedes_idSedes, Generos_idGeneros, Ropa_personas_idRopa_personas
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      pickPersonaSet(persona)
    );
    const personaId = pIns.insertId;

    const sedeId = Number(persona.Sedes_idSedes);

    // Horario es OBLIGATORIO (para que caiga en asistencia por ese horario)
    if (!asignacion?.horarioId) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ ok:false, msg:"Debes seleccionar un horario" });
    }
    const okH = await horarioPerteneceASede(conn, asignacion.horarioId, sedeId);
    if (!okH) { await conn.rollback(); conn.release(); return res.status(400).json({ ok:false, msg:"El horario seleccionado no pertenece a la sede del alumno" }); }

    // Guardamos el vínculo (esto es lo que hace que en Asistencia aparezca por horario)
    await conn.query(
      `INSERT INTO Personas_Horarios (Personas_idPersonas, Sedes_idSedes, Horarios_has_Dias_Id_Horarios_dias)
       VALUES (?,?,?)`,
      [personaId, sedeId, Number(asignacion.horarioId)]
    );

    // Programa/cinta
    if (asignacion?.programaId) {
      let cintaId = asignacion.cintaId ? Number(asignacion.cintaId) : null;
      if (cintaId) {
        const okC = await cintaDeProgramaValida(conn, cintaId, asignacion.programaId);
        if (!okC) { await conn.rollback(); conn.release(); return res.status(400).json({ ok:false, msg:"La cinta seleccionada no pertenece al programa elegido" }); }
      } else {
        cintaId = await primeraCintaDePrograma(conn, asignacion.programaId);
        if (!cintaId) { await conn.rollback(); conn.release(); return res.status(400).json({ ok:false, msg:"No hay cintas definidas para el programa seleccionado" }); }
      }
      await conn.query(
        `INSERT INTO Cinta_Personas (Personas_idPersonas, Cinta_idCinta) VALUES (?,?)`,
        [personaId, cintaId]
      );
    }

    await conn.commit();
    res.json({ ok:true, msg:"Alumno creado", idPersonas: personaId });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error("Error creando alumno:", e?.sqlMessage || e?.message || e);
    res.status(500).json({ ok:false, msg: e?.sqlMessage || "Error creando alumno con asignaciones" });
  } finally {
    conn.release();
  }
});

/* ========================= Actualizar datos ========================= */
// PUT /api/alumnos/:id
router.put("/:id", /*requireAuth,*/ async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id || 0);
    const { persona } = req.body || {};
    if (!id) { conn.release(); return res.status(400).json({ ok:false, msg:"Id inválido" }); }

    if (persona?.Fecha_nac) persona.Fecha_nac = toISODate(persona.Fecha_nac);

    await conn.beginTransaction();
    if (persona && Object.keys(persona).length) {
      await conn.query(
        `UPDATE Personas SET
           Primer_nombre = COALESCE(?, Primer_nombre),
           Segundo_nombre = COALESCE(?, Segundo_nombre),
           Primer_apellido = COALESCE(?, Primer_apellido),
           Segundo_apellido = COALESCE(?, Segundo_apellido),
           Telefono = COALESCE(?, Telefono),
           Persona_emergencia = COALESCE(?, Persona_emergencia),
           Contacto_emergencia = COALESCE(?, Contacto_emergencia),
           Edad = COALESCE(?, Edad),
           Fecha_nac = COALESCE(?, Fecha_nac),
           Año_inicio = COALESCE(?, Año_inicio),
           Sedes_idSedes = COALESCE(?, Sedes_idSedes),
           Generos_idGeneros = COALESCE(?, Generos_idGeneros),
           Ropa_personas_idRopa_personas = COALESCE(?, Ropa_personas_idRopa_personas)
         WHERE idPersonas=?`,
        [...pickPersonaSet(persona), id]
      );
    }
    await conn.commit();
    res.json({ ok:true, msg:"Alumno actualizado" });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error actualizando alumno" });
  } finally {
    conn.release();
  }
});

/* ========================= Cinta (asignar/actualizar) ========================= */
// PUT /api/alumnos/:id/cinta  body:{ cintaId }
router.put("/:id/cinta", /*requireAuth,*/ async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id || 0);
    const cintaId = Number(req.body?.cintaId || 0);
    if (!id || !cintaId) { conn.release(); return res.status(400).json({ ok:false, msg:"Datos inválidos" }); }

    const [[c]] = await conn.query(`SELECT 1 FROM Cinta WHERE idCinta=?`, [cintaId]);
    if (!c) { conn.release(); return res.status(400).json({ ok:false, msg:"Cinta inválida" }); }

    await conn.beginTransaction();
    await conn.query(`DELETE FROM Cinta_Personas WHERE Personas_idPersonas=?`, [id]);
    await conn.query(`INSERT INTO Cinta_Personas (Personas_idPersonas, Cinta_idCinta) VALUES (?,?)`, [id, cintaId]);
    await conn.commit();

    res.json({ ok:true, msg:"Cinta actualizada" });
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error actualizando cinta" });
  } finally {
    conn.release();
  }
});

/* ========================= Horarios (agregar/quitar) ========================= */
// POST /api/alumnos/:id/horarios   body:{ horarioId }
router.post("/:id/horarios", /*requireAuth,*/ async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id || 0);
    const horarioId = Number(req.body?.horarioId || 0);
    if (!id || !horarioId) { conn.release(); return res.status(400).json({ ok:false, msg:"Datos inválidos" }); }

    const [[p]] = await conn.query(`SELECT Sedes_idSedes FROM Personas WHERE idPersonas=?`, [id]);
    if (!p) { conn.release(); return res.status(404).json({ ok:false, msg:"Alumno no encontrado" }); }

    const okH = await horarioPerteneceASede(conn, horarioId, p.Sedes_idSedes);
    if (!okH) { conn.release(); return res.status(400).json({ ok:false, msg:"El horario no pertenece a la sede del alumno" }); }

    await conn.query(
      `INSERT INTO Personas_Horarios (Personas_idPersonas, Sedes_idSedes, Horarios_has_Dias_Id_Horarios_dias)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE Sedes_idSedes=VALUES(Sedes_idSedes)`,
      [id, p.Sedes_idSedes, horarioId]
    );
    res.json({ ok:true, msg:"Horario agregado" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error agregando horario" });
  } finally {
    conn.release();
  }
});

// DELETE /api/alumnos/:id/horarios/:horarioId
router.delete("/:id/horarios/:horarioId", /*requireAuth,*/ async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    const horarioId = Number(req.params.horarioId || 0);
    if (!id || !horarioId) return res.status(400).json({ ok:false, msg:"Datos inválidos" });

    await pool.query(
      `DELETE FROM Personas_Horarios
        WHERE Personas_idPersonas=? AND Horarios_has_Dias_Id_Horarios_dias=?`,
      [id, horarioId]
    );
    res.json({ ok:true, msg:"Horario eliminado" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:"Error eliminando horario" });
  }
});

export default router;
