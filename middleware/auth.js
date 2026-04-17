export function requireAdmin(req, res, next) {
  if (!req.session?.is_admin) {
    return res.status(403).json({ ok: false, error: "NOT_ADMIN" });
  }
  next();
}