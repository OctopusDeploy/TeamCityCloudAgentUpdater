import * as agents from './agents.js';
import * as cloudProfiles from './cloud-profiles.js';
import * as utils from './utils.js';

// Re-export everything for convenient consumption
export const {
  getAuthorisedAgents,
  getAgentDetails,
  disableAgent,
  checkAgentMatches,
  disableAgentWith,
  disableOldAgents,
  removeAgent,
  removeAgentIfSuperseded,
  removeDisabledAgents
} = agents;

export const {
  getRootProjectFeatures,
  getCloudProfile,
  getCloudImage,
  updateCloudImageOnTeamCity,
  tweakImageName,
  updateCloudImage
} = cloudProfiles;

export const {
  shortenImage,
  getAgentProperty,
  getFeatureProperty,
  setFeatureProperty
} = utils;

// Also export the modules themselves for cleaner imports
export { agents, cloudProfiles, utils };
