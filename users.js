import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, requireRole("Administrador"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { persona, usuario, rolId } = req.body;

    const reqPersona = [
      "Primer_nombre","Primer_apellido","Telefono",
      "Persona_emergencia","Contacto_emergencia","Edad",
      "Fecha_nac","Año_inicio","Sedes_idSedes","Generos_idGeneros"
    ];
    for (const k of reqPersona) {
      if (!persona?.[k]) return res.status(400).json({ ok:false, msg:`Falta persona.${k}` });
    }
    if (!usuario?.email || !usuario?.nickname || !usuario?.pasword) {
      return res.status(400).json({ ok:false, msg:"Faltan datos de usuario (email, nickname, pasword)" });
    }
    if (!rolId) return res.status(400).json({ ok:false, msg:"Falta rolId" });

    const [dup] = await pool.query("SELECT 1 FROM usuarios WHERE email = ? LIMIT 1", [usuario.email]);
    if (dup.length) return res.status(400).json({ ok:false, msg:"El correo ya existe" });

    const defaultRopaId = 1;

    await conn.beginTransaction();

    const [pRes] = await conn.query(
      `INSERT INTO personas
       (Primer_nombre, Segundo_nombre, Primer_apellido, Segundo_apellido, Telefono,
        Persona_emergencia, Contacto_emergencia, Edad, Fecha_nac, Año_inicio,
        Sedes_idSedes, Generos_idGeneros, Ropa_personas_idRopa_personas)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
       [
         persona.Primer_nombre || "",
         persona.Segundo_nombre || "",
         persona.Primer_apellido,
         persona.Segundo_apellido || "",
         persona.Telefono,
         persona.Persona_emergencia,
         persona.Contacto_emergencia,
         persona.Edad,
         persona.Fecha_nac,
         persona.Año_inicio,
         persona.Sedes_idSedes,
         persona.Generos_idGeneros,
         defaultRopaId
       ]
    );
    const idPersonas = pRes.insertId;

    const [uRes] = await conn.query(
      `INSERT INTO usuarios (email, nickname, pasword, Personas_idPersonas)
       VALUES (?,?,?,?)`,
       [usuario.email, usuario.nickname, usuario.pasword, idPersonas]
    );
    const idUsuarios = uRes.insertId;

    await conn.query(
      `INSERT INTO personas_roles (Personas_idPersonas, Roles_idRoles)
       VALUES (?,?)`,
       [idPersonas, rolId]
    );

    await conn.commit();
    return res.json({ ok:true, msg:"Usuario creado", idPersonas, idUsuarios });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch {}
    return res.status(500).json({ ok:false, msg:"Error creando usuario" });
  } finally {
    conn.release();
  }
});

export default router;
