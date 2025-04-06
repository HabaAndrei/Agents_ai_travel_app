const Firebase = require('../providers/Firebase.js');
module.exports = async (req, res, next) => {
  const { user_token } = req.body;

  const firebase = new Firebase();

  if (!user_token) {
    res.sendStatus(401);
    return;
  }

  const resultVerification = await firebase.verifyIdToken(user_token);
  if (!resultVerification.isResolved) {
    res.sendStatus(401);
    return;
  }

  return next();
}