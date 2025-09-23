'use strict';

const agents = require('./agents');
const cloudProfiles = require('./cloud-profiles');
const utils = require('./utils');

// Export all functions for backward compatibility
module.exports = {
  // Agent functions
  getAuthorisedAgents: agents.getAuthorisedAgents,
  getAgentDetails: agents.getAgentDetails,
  disableAgent: agents.disableAgent,
  checkAgentMatches: agents.checkAgentMatches,
  disableAgentWith: agents.disableAgentWith,
  disableOldAgents: agents.disableOldAgents,
  removeAgent: agents.removeAgent,
  removeAgentIfSuperseded: agents.removeAgentIfSuperseded,
  removeDisabledAgents: agents.removeDisabledAgents,

  // Cloud Profile functions
  getRootProjectFeatures: cloudProfiles.getRootProjectFeatures,
  getCloudProfile: cloudProfiles.getCloudProfile,
  getCloudImage: cloudProfiles.getCloudImage,
  updateCloudImageOnTeamCity: cloudProfiles.updateCloudImageOnTeamCity,
  tweakImageName: cloudProfiles.tweakImageName,
  updateCloudImage: cloudProfiles.updateCloudImage,

  // Utility functions
  shortenImage: utils.shortenImage,
  getAgentProperty: utils.getAgentProperty,
  getFeatureProperty: utils.getFeatureProperty,
  setFeatureProperty: utils.setFeatureProperty,

  // Also export the modules themselves for cleaner imports
  agents,
  cloudProfiles,
  utils
};