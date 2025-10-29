// /api/ping.js
export default function handler(req, res) {
  res.status(200).json({ ok: true, message: "pong", method: req.method });
}
