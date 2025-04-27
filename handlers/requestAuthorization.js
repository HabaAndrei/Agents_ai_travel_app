const crypto = require("crypto")
const EnvConfig = require('../providers/EnvConfig.js');

const envVariable = EnvConfig.getInstance();

module.exports = async (req, res, next) => {
  const hash = req.headers['authorization'];
  const body = req.body;
  const customToken = envVariable.get('AUTHORIZATION_CUSTOM_TOKEN');
  let verificationHash = crypto.createHash('sha256').update(JSON.stringify(body) + customToken).digest('hex')

  if (verificationHash != hash) {
    res.sendStatus(401);
    return;
  }

  return next();
}