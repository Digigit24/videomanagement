import jwt from "jsonwebtoken";
import { getUserByEmail, verifyPassword } from "../services/user.js";

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    console.log(`[Auth] Login attempt for: ${email}`);

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Get user from database
    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    console.log(
      `[Auth Controller] JWT_SECRET exists: ${!!process.env.JWT_SECRET}, Length: ${process.env.JWT_SECRET?.length}`,
    );
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
}
