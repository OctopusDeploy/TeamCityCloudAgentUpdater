'use strict';

var colors = require('colors/safe');
var http = require('https');
const utils = require('./utils');

function getAuthorisedAgents(server, auth, callback) {
  http.get({
    host: server.replace(/https?:\/\//, ''),
    path: '/app/rest/agents?locator=authorized:true',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
    },
    agent: false
  }, function(response) {
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
          var parsed = JSON.parse(body);
          callback(parsed);
      });
  }).end();
}

function getAgentDetails(server, auth, href, callback) {
  http.get({
    host: server.replace(/https?:\/\//, ''),
    path: href,
    headers: {
      'accept': 'application/json',
      "Authorization" : auth,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
    },
    agent: false
  }, function(response) {
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
          if (response.statusCode !== 200) {
            body = `{}`;
            console.log(colors.yellow("WARN: Server returned status code " + response.statusCode + " when trying to get agent details from '" + href + "'. Ignoring this agent and moving on."));
          }
          var parsed = JSON.parse(body);
          callback(parsed);
      });
  }).end();
}

function disableAgent(server, auth, agent, oldImage, newImage, dryrun) {
  if (dryrun) {
    console.log(colors.cyan("INFO: Would have disabled agent " + agent.id + " from teamcity."));
    return;
  }

  var req = http.request({
    host: server.replace(/https?:\/\//, ''),
    path: agent.href + "/enabledInfo",
    method: 'PUT',
    headers: {
      'content-type': 'application/xml',
      'Authorization' : auth,
      'Origin': server,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
    },
    agent: false
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 2."));
          process.exit(2);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.cyan("INFO: Successfully disabled agent " + agent.id + " from teamcity."));
        console.log(colors.gray("VERBOSE: " + body));
      });
  });

  req.on('error', function (e) {
    console.log(colors.red("ERROR: " + e));
    console.log(colors.red("ERROR: Got error when disabling agent. Exiting with exit code 3."));
    process.exit(3);
  });

  req.on('timeout', function () {
    console.log(colors.red("ERROR: timeout"));
    req.abort();
  });

  req.write("<enabledInfo status='false'><comment><text>Disabling agent as it uses base image " + utils.shortenImage(oldImage) + ", which has been superseded by base image " + utils.shortenImage(newImage) + ".</text></comment></enabledInfo>");

  req.end();
}

function checkAgentMatches(agent, image, cloudProfileId, success, failure) {
    if (agent.properties) {
      var reportedImageId = utils.getAgentProperty(agent, 'system.ec2.ami-id');
      var agentCloudProfileId = utils.getAgentProperty(agent, 'system.cloud.profile_id')
      var agentProvenanceName = utils.getAgentProperty(agent, 'system.Octopus.Provenance.Name')
    }

    if (reportedImageId == image) {
      console.log(colors.cyan("INFO: Disabling agent " + agent.id + " as it uses old image " + reportedImageId));
      success(agent);
    } else if (cloudProfileId == agentCloudProfileId && image.endsWith(agentProvenanceName)) {
      console.log(colors.cyan("INFO: Disabling agent " + agent.id + " as it uses cloud profile " + cloudProfileId + " and has Octopus.Provenance.Name set to '" + agentProvenanceName + "'."));
      success(agent);
    } else {
      failure(agent);
    }
}

function disableAgentWith(server, auth, agents, oldImage, newImage, dryrun, cloudProfileId) {
  var failureCount = 0;
  agents.forEach(function(agent) {
      getAgentDetails(server, auth, agent.href, function(agentDetails) {
        var success = function(agent) {
            disableAgent(server, auth, agent, oldImage, newImage, dryrun);
        };
        var failure = function () {
          failureCount++;
          if (failureCount == agents.length) {
            console.log(colors.cyan("INFO: No agents with image = '" + oldImage + "' found. Nothing to disable."));
          }
        };

        checkAgentMatches(agentDetails, oldImage, cloudProfileId, success, failure);
      })
    })
}

function disableOldAgents(server, auth, oldImage, newImage, dryrun, cloudProfileId) {
  console.log(colors.cyan("INFO: Attempting to disable teamcity agents that use image " + oldImage + ", cloud profile id " + cloudProfileId));
  getAuthorisedAgents(server, auth, function(response) {
    var agents = response.agent;
    disableAgentWith(server, auth, agents, oldImage, newImage, dryrun, cloudProfileId);
  });
}

function removeAgent(server, auth, agent, dryrun) {
  if (dryrun) {
    console.log(colors.cyan("INFO: Would have removed agent " + agent.id + " from teamcity."));
    return;
  }

  var req = http.request({
    host: server.replace(/https?:\/\//, ''),
    path: "/app/rest/ui/cloud/instances/id:(" + agent.cloudInstance.id + ")",
    method: 'DELETE',
    headers: {
      'content-type': 'application/xml',
      'Authorization' : auth,
      'Origin': server,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
    },
    agent: false
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 11."));
          process.exit(11);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.cyan("INFO: Successfully deleted agent " + agent.id + " from teamcity."));
        console.log(colors.gray("VERBOSE: " + body));
      });
  });

  req.on('error', function (e) {
    console.log(colors.red("ERROR: " + e));
    console.log(colors.red("ERROR: Got error when deleting agent. Exiting with exit code 12."));
    process.exit(12);
  });

  req.on('timeout', function () {
    console.log(colors.red("ERROR: timeout"));
    req.abort();
  });

  req.end();
}

function removeAgentIfSuperseded(server, auth, agents, dryrun) {
  var failureCount = 0;
  agents.forEach(function(agent) {
      getAgentDetails(server, auth, agent.href + "?fields=id,name,href,build(id),enabled,enabledInfo(comment),cloudInstance", function(agentDetails) {
        var success = function(agent) {
          removeAgent(server, auth, agent, dryrun);
        };
        var failure = function () {
          failureCount++;
          if (failureCount == agents.length) {
            console.log(colors.cyan("INFO: No disabled, superseded agents found. Nothing to cleanup."));
          }
        };

        if (
          agentDetails.hasOwnProperty("enabled") && !agentDetails.enabled &&
          /Disabling agent as it uses base image .*, which has been superseded by base image .*\./.test(agentDetails.enabledInfo.comment.text)) {
          console.log(colors.cyan("INFO: Agent " + agentDetails.name + " uses old image and should be cleaned up (it had comment '" + agentDetails.enabledInfo.comment.text + "')"));
          if (agentDetails.hasOwnProperty("build")) {
            console.log(colors.cyan("INFO: Agent " + agentDetails.name + " is still running a build (" + agentDetails.build.id + "), skipping cleanup this time round."));
            failure(agentDetails);
          } else {
            success(agentDetails);
          }
        }
        else {
          failure(agentDetails);
        }
      })
    })
}

function removeDisabledAgents(server, auth, dryrun) {
  console.log(colors.cyan("INFO: Attempting to remove old disabled teamcity agents that have been replaced by newer images"));
  getAuthorisedAgents(server, auth, function(response) {
    var agents = response.agent;
    removeAgentIfSuperseded(server, auth, agents, dryrun);
  });
}

module.exports = {
  getAuthorisedAgents,
  getAgentDetails,
  disableAgent,
  checkAgentMatches,
  disableAgentWith,
  disableOldAgents,
  removeAgent,
  removeAgentIfSuperseded,
  removeDisabledAgents
};
