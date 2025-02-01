// validate fields for functions that call AI generation
module.exports = (req, res, next) => {
  const { method } = req.query;
  // Allowed methods
  const methodsAllowed = ['generateActivities', 'generateLocations', 'generateProgram', 'generateChatResponse'];
  // if the method does not exist or is not included in the allowed methods, return a 404 response
  if (!method || !methodsAllowed.includes(method)) return res.sendStatus(404);

  // methods and their required fields
  const methodsWithFields = {
    'generateActivities': ['city', 'country'],
    'generateLocations': ['city', 'country', 'customActivity', 'selectedActivities', 'isLocalPlaces', 'scaleVisit'],
    'generateProgram': ['startDate', 'endDate', 'city', 'country', 'locations', 'hotelAddress'],
    'generateChatResponse': ['historyConv', 'tripsData'],
  };
  // if any required field is undefined, return a 404 response
  methodsWithFields[method].forEach((field) => {
    // 422 Unprocessable Entity
    if (req.body[`${field}`] === undefined) return res.sendStatus(422);
  });

  return next();
}