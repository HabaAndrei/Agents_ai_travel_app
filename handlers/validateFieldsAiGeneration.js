// validate fields for functions that call AI generation
module.exports = (req, res, next) => {
  const { generationType } = req.body;

  // methods and their required fields
  const generationsWithFields = {
    'generateActivities': ['city', 'country'],
    'generateLocations': ['city', 'country', 'customActivity', 'selectedActivities', 'isLocalPlaces', 'scaleVisit'],
    'generateProgram': ['startDate', 'endDate', 'city', 'country', 'locations', 'hotelAddress'],
    'generateChatResponse': ['messagesConversation', 'tripsData'],
  };

  // if the method does not exist or is not included in the allowed generation, return a 422 response
  if (!generationType || !Object.keys(generationsWithFields).includes(generationType)) {
    res.sendStatus(422);
    return;
  }

  for (let field of generationsWithFields[generationType]) {
    // 422 Unprocessable Entity
    if (req.body[field] === undefined) {
      res.sendStatus(422);
      return;
    }
  }
  return next();
}