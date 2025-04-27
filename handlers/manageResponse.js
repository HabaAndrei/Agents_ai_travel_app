const Firebase = require('../providers/Firebase.js');
const db = new Firebase().db;

module.exports = async (functionName, response) => {
  if (response.isResolved) returș;

  await db.collection('server_errors').add({
    functionName, response, time: new Date()
  });

  return;
}