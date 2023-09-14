'use strict';

var program = require('commander');
var colors = require('colors/safe');
var http = require('https');
const { fail } = require('assert');

function getAuthorisedAgents(server, auth, callback) {
  http.get({
    host: server.replace(/https?:\/\//, ''),
    path: '/app/rest/agents?locator=authorized:true',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth
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
      "Authorization" : auth
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

function shortenImage(image) {
  //azure image id's are long and split with `/`. Humans only really care about the last segment.
  var splitImage = image.split('/')
  return splitImage[splitImage.length - 1]
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
      'Origin': server
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

  req.write("<enabledInfo status='false'><comment><text>Disabling agent as it uses base image " + shortenImage(oldImage) + ", which has been superseded by base image " + shortenImage(newImage) + ".</text></comment></enabledInfo>");

  req.end();
}

function getAgentProperty(agent, propertyName) {
  var result = null;
  agent.properties.property.forEach(function(property) {
      if (property.name == propertyName) {
        result = property.value;
      }
    });
  return result;
}

function checkAgentMatches(agent, image, cloudProfileId, success, failure) {
    if (agent.properties) {
      var reportedImageId = getAgentProperty(agent, 'system.ec2.ami-id');
      var agentCloudProfileId = getAgentProperty(agent, 'system.cloud.profile_id')
    }

    if (reportedImageId == image) {
      console.log(colors.cyan("INFO: Disabling agent " + agent.id + " as it uses old image " + reportedImageId));
      success(agent);
    } else if (cloudProfileId == agentCloudProfileId) {
      console.log(colors.cyan("INFO: Disabling agent " + agent.id + " as it uses old image " + cloudProfileId));
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

var getRootProjectFeatures = function(server, auth, callback) {
  http.get({
    host: server.replace(/https?:\/\//, ''),
    path: '/app/rest/projects/id:_Root/projectFeatures',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 4."));
          process.exit(4);
      }
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

function getFeatureProperty(feature, propertyName) {
  var result = null;
  feature.properties.property.forEach(function(property) {
    if (property.name == propertyName) {
      result = property.value;
    }
  });
  if (result)
    return result;
  console.log(colors.red("ERROR: Unable to find property '" + propertyName + "' on '" + JSON.stringify(feature) + "'. Exiting with code 5."));
  process.exit(5);
}

function setFeatureProperty(feature, propertyName, newValue) {
  feature.properties.property.forEach(function(property) {
    if (property.name == propertyName) {
      property.value = newValue;
      return;
    }
  });
}

var getCloudProfile = function(response, cloudProfileName) {
  var features = response.projectFeature;
  var returnFeature;
  features.forEach(function(feature) {
    if (feature.type === 'CloudProfile') {
      if (getFeatureProperty(feature, 'name') == cloudProfileName) {
        returnFeature = feature;
      }
    }
  });
  if (returnFeature)
    return returnFeature;
  console.log(colors.red("ERROR: Unable to find Cloud Profile '" + cloudProfileName + "'. Exiting with code 6."));
  process.exit(6);
}

var getCloudImage = function(cloudProfile, agentPrefix, response) {
  var cloudProfileId = cloudProfile.id;
  var features = response.projectFeature;
  var returnFeature;
  var agentPrefixProperty = getFeatureProperty(cloudProfile, 'cloud-code') === 'amazon' ? 'image-name-prefix' : 'source-id';
  features.forEach(function(feature) {
    if (feature.type === 'CloudImage') {
      if (getFeatureProperty(feature, 'profileId') === cloudProfileId) {
        if (getFeatureProperty(feature, agentPrefixProperty) === agentPrefix) {
          returnFeature = feature;
        }
      }
    }
  });
  if (returnFeature)
    return returnFeature;
  console.log(colors.red("ERROR: Unable to find Cloud Image with profileid '" + cloudProfileId + "' and " + agentPrefixProperty + " '" + agentPrefix + "'.  Exiting with code 7."));
  process.exit(7);
}

function updateCloudImageOnTeamCity(server, auth, cloudProfile, cloudImage, currentImage, newImage, cloudProfileName, agentPrefix, dryrun, callback) {
  if (dryrun) {
    console.log(colors.cyan("INFO: TeamCity cloud profile '" + cloudProfileName + "', image '" + agentPrefix + "' is currently set to use '" + currentImage + "'. Would update to use '" + newImage + "'."));
    callback();
    return;
  } else {
    console.log(colors.cyan("INFO: TeamCity cloud profile '" + cloudProfileName + "', image '" + agentPrefix + "' is currently set to use '" + currentImage + "'. Updating to use '" + newImage + "'."));
  }

  var host = server.replace(/https?:\/\//, '')
  var cloudCode = getFeatureProperty(cloudProfile, 'cloud-code')
  var agentPrefixProperty = cloudCode === 'amazon' ? 'image-name-prefix' : 'source-id';
  var imageProperty = cloudCode === 'amazon' ? 'amazon-id' : 'imageId';
  var path = '/app/rest/projects/id:_Root/projectFeatures/type:CloudImage,property(name:' + agentPrefixProperty + ',value:' + agentPrefix + ')/properties/' + imageProperty;
  var req = http.request({
    host: host,
    path: path,
    method: 'PUT',
    headers: {
      'Authorization': auth,
      'Content-type': 'text/plain',
      'Origin': server
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
          console.log(colors.cyan("INFO: Successfully updated cloudImage " + cloudImage.id + " in teamcity."));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 8."));
          process.exit(8);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.gray("VERBOSE: " + body));
        callback(cloudProfile.id);
      });
  });

  req.on('error', function (e) {
    console.log(colors.red(e));
    console.log(colors.red("ERROR: Got error when updating cloudImage. Exiting with exit code 9."));
    process.exit(9);
  });

  req.on('timeout', function () {
    req.abort();
    console.log(colors.red("ERROR: Got timeout when updating cloudImage. Exiting with exit code 10."));
    process.exit(10);
  });

  req.write(newImage);

  req.end();
}

var tweakImageName = function(cloudProfile, cloudImage, newImage) {
  if (getFeatureProperty(cloudProfile, 'cloud-code') !== 'arm')
    return newImage;
  //azure teamcity plugin mangles the resource id by capitalising the resource group name
  //see https://github.com/JetBrains/teamcity-azure-agent/issues/129
  var groupId = getFeatureProperty(cloudImage, 'groupId');
  return newImage.replace(groupId, groupId.toUpperCase())
}

var updateCloudImage = function(server, auth, cloudProfileName, agentPrefix, image, dryrun) {
  getRootProjectFeatures(server, auth, function (features) {
    var cloudProfile = getCloudProfile(features, cloudProfileName);
    var cloudImage = getCloudImage(cloudProfile, agentPrefix, features);
    var imageProperty = getFeatureProperty(cloudProfile, 'cloud-code') === 'amazon' ? 'amazon-id' : 'imageId';

    var currentImage = getFeatureProperty(cloudImage, imageProperty);
    var newImage = tweakImageName(cloudProfile, cloudImage, image);
    if (false) { //currentImage == newImage) { //nocommit
      console.log(colors.cyan("INFO: TeamCity cloud profile '" + cloudProfileName + "', image '" + agentPrefix + "' is already set to use '" + newImage + "'"));
    } else {
        setFeatureProperty(cloudImage, imageProperty, newImage);
        updateCloudImageOnTeamCity(server, auth, cloudProfile, cloudImage, currentImage, newImage, cloudProfileName, agentPrefix, dryrun, function(cloudProfileId) {
          disableOldAgents(server, auth, currentImage, newImage, dryrun, cloudProfileId);
        });
    }
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
      'Origin': server
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

var removeDisabledAgents = function(server, auth, dryrun) {
  console.log(colors.cyan("INFO: Attempting to remove old disabled teamcity agents that have been replaced by newer images"));
  getAuthorisedAgents(server, auth, function(response) {
    var agents = response.agent;
    removeAgentIfSuperseded(server, auth, agents, dryrun);
  });

}

program
  .name('TeamCity Cloud Agent Updater')
  .description('Simple NodeJS app to update images for TeamCity Cloud Agents, via the 2017.1 API.')
  .version('1.0.0');

program
  .command('update-cloud-profile', { isDefault: true })
  .requiredOption('--token <string>', 'A valid TeamCity user access token (requires TC 2019.1)')
  .requiredOption('--server <string>', 'The url of the TeamCity server, eg "http://teamcity.example.com"')
  .requiredOption('--image <string>', 'The AMI id (for AWS), or full url to the VHD / resource id of the managed image (for Azure)')
  .requiredOption('--cloudprofile <string>', 'The name of the TeamCity Cloud Profile to modify')
  .requiredOption('--agentprefix <string>', 'The agent prefix used in the Cloud Profile image that should be updated')
  .option('--dryrun', 'Output what changes the app would make, but dont actually make the changes')
  .action((options) => updateCloudImage(options.server, "Bearer " + options.token, options.cloudprofile, options.agentprefix, options.image, options.dryrun));

program
  .command('remove-disabled-agents')
  .requiredOption('--token <string>', 'A valid TeamCity user access token (requires TC 2019.1)')
  .requiredOption('--server <string>', 'The url of the TeamCity server, eg "http://teamcity.example.com"')
  .option('--dryrun', 'Output what changes the app would make, but dont actually make the changes')
  .action((options) => removeDisabledAgents(options.server, "Bearer " + options.token, options.dryrun));

program.parse(process.argv);
