import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import alumnosRoutes from "./routes/alumnos.js";
import asistenciaRoutes from "./routes/asistencia.js";
import pagosRoutes from "./routes/pagos.js";
import usuariosRoutes from "./routes/usuarios.js";
   





const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/alumnos", alumnosRoutes);
app.use("/api/asistencia", asistenciaRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/usuarios", usuariosRoutes);


app.get("/", (req, res) => res.send("MTK API OK"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API MTK en http://localhost:${PORT}`));
