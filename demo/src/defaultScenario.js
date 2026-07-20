// Non-secret defaults for the demo scenario builder.
// Edit these values to change what administrators see when the form opens.
export const DEFAULT_SCENARIO = Object.freeze({
  testerName: "Hackathon tester",
  userfirstname: "Alex",
  knowledgelevel: "Beginner",
  coursename: "JavaScript Foundations",
  lessonname: "Functions and parameters",
  lessongoal: "Understand how JavaScript functions receive parameters and return values.",
  content: "A function is a reusable block of code. Parameters are named inputs available inside the function, arguments are the values supplied when it is called, and a return statement sends a result back to the caller.",
  knowledgedomain: "JavaScript fundamentals: functions, parameters, arguments, return values, and basic debugging.",
  userpreferences: "Use plain language, short examples, and frequent comprehension checks. Let the learner reason before revealing an answer.",
  learningmemory: JSON.stringify(["The learner understands variables and basic expressions.", "The learner has called built-in functions but has limited experience defining functions."], null, 2),
  knowledgestrengths: JSON.stringify(["Recognizes variables and values", "Can follow short JavaScript examples"], null, 2),
  knowledgegaps: JSON.stringify(["Distinguishing parameters from arguments", "Understanding what return does"], null, 2),
  practicerecommendations: JSON.stringify(["Define a function with two parameters", "Predict the returned value before running an example"], null, 2),
  scenarioNotes: "Default hackathon scenario. Adjust any learning parameter before generating the demo link."
});
