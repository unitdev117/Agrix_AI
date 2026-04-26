const { ALLOWED_TRANSITIONS } = require('./constants');

const getValidNextStates = (currentState) => ALLOWED_TRANSITIONS[currentState] || [];

const canTransition = (currentState, nextState) => getValidNextStates(currentState).includes(nextState);

module.exports = {
    getValidNextStates,
    canTransition,
};
