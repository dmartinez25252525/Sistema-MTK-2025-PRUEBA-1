// backend/routes/usuarios.js
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const ONLY_ADMIN = requireRole("Administrador");

// ---------- utils ----------
async function getRolById(id) {
  const [[r]] = await pool.query(`SELECT idRoles, Tipo_usuario FROM Roles WHERE idRoles=?`, [id]);
  return r || null;
}
async function ensurePersonaRole(personaId, rolId) {
  // único rol por persona (como definiste)
  await pool.query(`DELETE FROM Personas_Roles WHERE Personas_idPersonas=?`, [personaId]);
  await pool.query(`INSERT INTO Personas_Roles (Personas_idPersonas, Roles_idRoles) VALUES (?,?)`, [personaId, rolId]);
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
function sedeValidaParaSensei(rolNombre, sedeId) {
  // 1: Gym Central, 2: Joyabaj, 3/4/5: Antigua*
  if (rolNombre === "Sensei Gym Central") return Number(sedeId) === 1;
  if (rolNombre === "Sensei Joyabaj")     return Number(sedeId) === 2;
  if (rolNombre === "Sensei Antigua Guatemala") return [3,4,5].includes(Number(sedeId));
  return true; // otros roles (Admin, Secretaria)
}

// ---------- catálogos ----------
router.get("/catalogos", requireAuth, ONLY_ADMIN, async (_req, res) => {
  try {
    const [roles]   = await pool.query(`SELECT idRoles, Tipo_usuario FROM Roles ORDER BY idRoles`);
    const [sedes]   = await pool.query(`SELECT idSedes, Nombre FROM Sedes ORDER BY Nombre`);
    const [generos] = await pool.query(`SELECT idGeneros, Descripcion FROM Generos ORDER BY Descripcion`);
    res.json({ ok:true, data:{ roles, sedes, generos } });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, msg:"Error catálogos" }); }
});

// ---------- listar ----------
router.get("/listar", requireAuth, ONLY_ADMIN, async (req, res) => {
  try {
    const search  = String(req.query.search || "").trim();
    const sedeId  = Number(req.query.sedeId || 0);
    const rolId   = Number(req.query.rolId || 0);
    const activos = req.query.activos === "0" ? 0 : req.query.activos === "1" ? 1 : null;

    const where = [];
    const args  = [];
    if (search) {
      where.push(`(u.email LIKE ? OR u.nickname LIKE ? OR p.Primer_nombre LIKE ? OR p.Primer_apellido LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (sedeId) { where.push(`p.Sedes_idSedes=?`); args.push(sedeId); }
    if (rolId)  { where.push(`r.idRoles=?`); args.push(rolId); }
    if (activos !== null) { where.push(`COALESCE(u.Activo,1)=?`); args.push(activos); }

    const [rows] = await pool.query(
      `
      SELECT 
        u.idUsuarios, u.email, u.nickname, COALESCE(u.Activo,1) AS Activo,
        p.idPersonas, p.Primer_nombre, p.Primer_apellido, s.Nombre AS SedeNombre,
        r.idRoles AS RolId, r.Tipo_usuario
      FROM Usuarios u
      JOIN Personas p              ON p.idPersonas = u.Personas_idPersonas
      LEFT JOIN Sedes s            ON s.idSedes = p.Sedes_idSedes
      LEFT JOIN Personas_Roles pr  ON pr.Personas_idPersonas = p.idPersonas
      LEFT JOIN Roles r            ON r.idRoles = pr.Roles_idRoles
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY r.Tipo_usuario, s.Nombre, p.Primer_apellido, p.Primer_nombre
      LIMIT 1000
      `,
      args
    );

    const data = rows.map(r => ({
      idUsuarios: r.idUsuarios,
      email: r.email,
      nickname: r.nickname,
      Activo: r.Activo,
      rol: { idRoles: r.RolId, Tipo_usuario: r.Tipo_usuario },
      persona: { idPersonas: r.idPersonas, Primer_nombre: r.Primer_nombre, Primer_apellido: r.Primer_apellido, SedeNombre: r.SedeNombre }
    }));

    res.json({ ok:true, data });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, msg:"Error listando usuarios" }); }
});

// ---------- obtener por id ----------
router.get("/:id", requireAuth, ONLY_ADMIN, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[u]] = await pool.query(
      `SELECT u.idUsuarios, u.email, u.nickname, COALESCE(u.Activo,1) AS Activo, p.*
       FROM Usuarios u
       JOIN Personas p ON p.idPersonas = u.Personas_idPersonas
       WHERE u.idUsuarios=? LIMIT 1`,
      [id]
    );
    if (!u) return res.status(404).json({ ok:false, msg:"Usuario no encontrado" });

    const [[rol]] = await pool.query(
      `SELECT r.idRoles, r.Tipo_usuario
       FROM Personas_Roles pr JOIN Roles r ON r.idRoles=pr.Roles_idRoles
       WHERE pr.Personas_idPersonas=? LIMIT 1`, [u.idPersonas]
    );

    res.json({
      ok:true,
      data:{
        idUsuarios: u.idUsuarios,
        email: u.email,
        nickname: u.nickname,
        Activo: u.Activo,
        persona: {
          idPersonas: u.idPersonas,
          Primer_nombre: u.Primer_nombre,
          Segundo_nombre: u.Segundo_nombre,
          Primer_apellido: u.Primer_apellido,
          Segundo_apellido: u.Segundo_apellido,
          Telefono: u.Telefono,
          Persona_emergencia: u.Persona_emergencia,
          Contacto_emergencia: u.Contacto_emergencia,
          Edad: u.Edad,
          Fecha_nac: u.Fecha_nac,
          Año_inicio: u.Año_inicio,
          Sedes_idSedes: u.Sedes_idSedes,
          Generos_idGeneros: u.Generos_idGeneros,
          Ropa_personas_idRopa_personas: u.Ropa_personas_idRopa_personas
        },
        rol: rol || null
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, msg:"Error obteniendo usuario" }); }
});

// ---------- crear ----------
// body: { persona:{...}, usuario:{ email,nickname,pasword,Activo? }, rolId }  (o { personaId, usuario, rolId })
router.post("/crear", requireAuth, ONLY_ADMIN, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { persona, personaId, usuario, rolId } = req.body || {};
    if ((!persona && !personaId) || !usuario?.email || !usuario?.nickname || !usuario?.pasword || !rolId) {
      conn.release(); return res.status(400).json({ ok:false, msg:"Faltan datos" });
    }
    const rol = await getRolById(Number(rolId));
    if (!rol) { conn.release(); return res.status(400).json({ ok:false, msg:"Rol inválido" }); }

    await conn.beginTransaction();

    let pid = Number(personaId) || 0;
    if (!pid) {
      const oblig = ["Primer_nombre","Primer_apellido","Sedes_idSedes","Generos_idGeneros"];
      for (const c of oblig) if (!persona[c]) { await conn.rollback(); conn.release(); return res.status(400).json({ ok:false, msg:`Falta ${c} en Persona` }); }

      // Validar sede si es sensei
      if (!sedeValidaParaSensei(rol.Tipo_usuario, persona.Sedes_idSedes)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ ok:false, msg:"La sede no corresponde con el rol de sensei seleccionado" });
      }

      const [pIns] = await conn.query(
        `INSERT INTO Personas (
          Primer_nombre, Segundo_nombre, Primer_apellido, Segundo_apellido, Telefono,
          Persona_emergencia, Contacto_emergencia, Edad, Fecha_nac, Año_inicio,
          Sedes_idSedes, Generos_idGeneros, Ropa_personas_idRopa_personas
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        pickPersonaSet(persona)
      );
      pid = pIns.insertId;
    } else {
      // si dieron personaId, y el rol es sensei, validamos sede de esa persona
      if (["Sensei Gym Central","Sensei Joyabaj","Sensei Antigua Guatemala"].includes(rol.Tipo_usuario)) {
        const [[pRow]] = await conn.query(`SELECT Sedes_idSedes FROM Personas WHERE idPersonas=?`, [pid]);
        if (!pRow || !sedeValidaParaSensei(rol.Tipo_usuario, pRow.Sedes_idSedes)) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ ok:false, msg:"La sede de la persona no corresponde al rol de sensei" });
        }
      }
    }

    const [[dup]] = await conn.query(`SELECT 1 FROM Usuarios WHERE email=? LIMIT 1`, [usuario.email]);
    if (dup) { await conn.rollback(); conn.release(); return res.status(409).json({ ok:false, msg:"Email ya existe" }); }

    const [uIns] = await conn.query(
      `INSERT INTO Usuarios (email, nickname, pasword, Personas_idPersonas, Activo) VALUES (?,?,?,?,?)`,
      [usuario.email, usuario.nickname, usuario.pasword, pid, (usuario.Activo ?? 1)]
    );

    await ensurePersonaRole(pid, rol.idRoles);

    await conn.commit();
    res.json({ ok:true, msg:"Usuario creado", idUsuarios: uIns.insertId, idPersonas: pid });
  } catch (e) {
    await conn.rollback(); console.error(e); res.status(500).json({ ok:false, msg:"Error creando usuario" });
  } finally { conn.release(); }
});

// ---------- actualizar ----------
// body: { persona:{...}, usuario:{ email,nickname,Activo }, rolId }
router.put("/:id", requireAuth, ONLY_ADMIN, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const { persona, usuario, rolId } = req.body || {};
    if (!id) { conn.release(); return res.status(400).json({ ok:false, msg:"Id inválido" }); }

    const [[u]] = await conn.query(`SELECT Personas_idPersonas FROM Usuarios WHERE idUsuarios=?`, [id]);
    if (!u) { conn.release(); return res.status(404).json({ ok:false, msg:"Usuario no encontrado" }); }

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
        [...pickPersonaSet(persona), u.Personas_idPersonas]
      );
    }

    if (usuario && (usuario.email || usuario.nickname || typeof usuario.Activo === "number")) {
      await conn.query(
        `UPDATE Usuarios SET
           email = COALESCE(?, email),
           nickname = COALESCE(?, nickname),
           Activo = COALESCE(?, Activo)
         WHERE idUsuarios=?`,
        [usuario.email ?? null, usuario.nickname ?? null, (usuario.Activo===0||usuario.Activo===1)?usuario.Activo:null, id]
      );
    }

    if (rolId) {
      const rol = await getRolById(Number(rolId));
      if (!rol) { await conn.rollback(); conn.release(); return res.status(400).json({ ok:false, msg:"Rol inválido" }); }
      // si el nuevo rol es sensei, validar sede actual de la persona
      if (["Sensei Gym Central","Sensei Joyabaj","Sensei Antigua Guatemala"].includes(rol.Tipo_usuario)) {
        const [[pRow]] = await conn.query(`SELECT Sedes_idSedes FROM Personas WHERE idPersonas=?`, [u.Personas_idPersonas]);
        if (!pRow || !sedeValidaParaSensei(rol.Tipo_usuario, pRow.Sedes_idSedes)) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ ok:false, msg:"La sede de la persona no corresponde al rol de sensei" });
        }
      }
      await ensurePersonaRole(u.Personas_idPersonas, rol.idRoles);
    }

    await conn.commit();
    res.json({ ok:true, msg:"Usuario actualizado" });
  } catch (e) {
    await conn.rollback(); console.error(e); res.status(500).json({ ok:false, msg:"Error actualizando usuario" });
  } finally { conn.release(); }
});

// ---------- reset password ----------
router.put("/:id/password", requireAuth, ONLY_ADMIN, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { pasword } = req.body || {};
    if (!id || !pasword) return res.status(400).json({ ok:false, msg:"Datos inválidos" });
    await pool.query(`UPDATE Usuarios SET pasword=? WHERE idUsuarios=?`, [pasword, id]);
    res.json({ ok:true, msg:"Contraseña actualizada" });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, msg:"Error cambiando contraseña" }); }
});

// ---------- activar / inactivar ----------
router.put("/:id/activar", requireAuth, ONLY_ADMIN, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const Activo = Number(req.body.Activo);
    if (!id || ![0,1].includes(Activo)) return res.status(400).json({ ok:false, msg:"Datos inválidos" });
    await pool.query(`UPDATE Usuarios SET Activo=? WHERE idUsuarios=?`, [Activo, id]);
    res.json({ ok:true, msg: Activo? "Usuario activado":"Usuario inactivado" });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, msg:"Error cambiando estado" }); }
});

export default router;
