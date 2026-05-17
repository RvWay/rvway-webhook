module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).end('google.com, pub-6588158210279012, DIRECT, f08c47fec0942fa0');
};
