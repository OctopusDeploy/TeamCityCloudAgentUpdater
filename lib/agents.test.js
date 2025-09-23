const https = require('https');
const { EventEmitter } = require('events');
const agents = require('./agents');

// Mock dependencies
jest.mock('colors/safe', () => ({
  cyan: jest.fn(str => str),
  red: jest.fn(str => str),
  yellow: jest.fn(str => str),
  gray: jest.fn(str => str)
}));

jest.mock('https');

jest.mock('./utils', () => ({
  shortenImage: jest.fn(img => img.split('/').pop()),
  getAgentProperty: jest.fn((agent, prop) => {
    const property = agent.properties?.property?.find(p => p.name === prop);
    return property?.value || null;
  })
}));

describe('Agent Operations', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    process.exit.mockRestore();
  });

  describe('getAuthorisedAgents', () => {
    it('should fetch authorized agents from TeamCity', (done) => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();

      https.get.mockImplementation((options, callback) => {
        expect(options.host).toBe('teamcity.example.com');
        expect(options.path).toBe('/app/rest/agents?locator=authorized:true');
        expect(options.headers.Authorization).toBe('Bearer token123');

        callback(mockResponse);

        setTimeout(() => {
          mockResponse.emit('data', JSON.stringify({ agent: [{ id: 'agent-1' }] }));
          mockResponse.emit('end');
        }, 0);

        return mockRequest;
      });

      const callback = jest.fn((response) => {
        expect(response.agent).toHaveLength(1);
        expect(response.agent[0].id).toBe('agent-1');
        done();
      });

      agents.getAuthorisedAgents('https://teamcity.example.com', 'Bearer token123', callback);
    });
  });

  describe('getAgentDetails', () => {
    it('should fetch agent details from TeamCity', (done) => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();

      https.get.mockImplementation((options, callback) => {
        expect(options.path).toBe('/app/rest/agents/1');

        callback(mockResponse);

        setTimeout(() => {
          mockResponse.emit('data', JSON.stringify({ id: 'agent-1', name: 'Test Agent' }));
          mockResponse.emit('end');
        }, 0);

        return mockRequest;
      });

      const callback = jest.fn((response) => {
        expect(response.id).toBe('agent-1');
        expect(response.name).toBe('Test Agent');
        done();
      });

      agents.getAgentDetails('https://teamcity.example.com', 'Bearer token123', '/app/rest/agents/1', callback);
    });

    it('should return empty object on non-200 status', (done) => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 404;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();

      https.get.mockImplementation((options, callback) => {
        callback(mockResponse);

        setTimeout(() => {
          mockResponse.emit('data', 'Not found');
          mockResponse.emit('end');
        }, 0);

        return mockRequest;
      });

      const callback = jest.fn((response) => {
        expect(response).toEqual({});
        done();
      });

      agents.getAgentDetails('https://teamcity.example.com', 'Bearer token123', '/app/rest/agents/1', callback);
    });
  });

  describe('checkAgentMatches', () => {
    it('should call success when agent has matching AMI ID', () => {
      const agent = {
        id: 'agent-1',
        properties: {
          property: [
            { name: 'system.ec2.ami-id', value: 'ami-12345' }
          ]
        }
      };

      const success = jest.fn();
      const failure = jest.fn();

      agents.checkAgentMatches(agent, 'ami-12345', 'cloud-1', success, failure);

      expect(success).toHaveBeenCalledWith(agent);
      expect(failure).not.toHaveBeenCalled();
    });

    it('should call success when agent matches cloud profile and provenance name', () => {
      const agent = {
        id: 'agent-1',
        properties: {
          property: [
            { name: 'system.ec2.ami-id', value: 'ami-different' },
            { name: 'system.cloud.profile_id', value: 'cloud-1' },
            { name: 'system.Octopus.Provenance.Name', value: 'ubuntu-agent' }
          ]
        }
      };

      const success = jest.fn();
      const failure = jest.fn();

      agents.checkAgentMatches(agent, 'prefix/ubuntu-agent', 'cloud-1', success, failure);

      expect(success).toHaveBeenCalledWith(agent);
      expect(failure).not.toHaveBeenCalled();
    });

    it('should call failure when agent does not match', () => {
      const agent = {
        id: 'agent-1',
        properties: {
          property: [
            { name: 'system.ec2.ami-id', value: 'ami-different' },
            { name: 'system.cloud.profile_id', value: 'cloud-2' }
          ]
        }
      };

      const success = jest.fn();
      const failure = jest.fn();

      agents.checkAgentMatches(agent, 'ami-12345', 'cloud-1', success, failure);

      expect(success).not.toHaveBeenCalled();
      expect(failure).toHaveBeenCalledWith(agent);
    });
  });

  describe('disableAgent', () => {
    it('should skip disabling in dryrun mode', () => {
      const agent = { id: 'agent-1', href: '/app/rest/agents/1' };

      https.request = jest.fn();

      agents.disableAgent('https://teamcity.example.com', 'Bearer token123', agent, 'ami-old', 'ami-new', true);

      expect(https.request).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would have disabled agent'));
    });

    it('should send PUT request to disable agent', () => {
      const agent = { id: 'agent-1', href: '/app/rest/agents/1' };

      const mockRequest = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      https.request.mockReturnValue(mockRequest);

      agents.disableAgent('https://teamcity.example.com', 'Bearer token123', agent, 'ami-old', 'ami-new', false);

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'teamcity.example.com',
          path: '/app/rest/agents/1/enabledInfo',
          method: 'PUT'
        }),
        expect.any(Function)
      );
      expect(mockRequest.write).toHaveBeenCalledWith(expect.stringContaining('ami-old'));
      expect(mockRequest.write).toHaveBeenCalledWith(expect.stringContaining('ami-new'));
      expect(mockRequest.end).toHaveBeenCalled();
    });
  });

  describe('removeAgent', () => {
    it('should skip removing in dryrun mode', () => {
      const agent = {
        id: 'agent-1',
        cloudInstance: { id: 'instance-1' }
      };

      https.request = jest.fn();

      agents.removeAgent('https://teamcity.example.com', 'Bearer token123', agent, true);

      expect(https.request).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would have removed agent'));
    });

    it('should send DELETE request to remove agent', () => {
      const agent = {
        id: 'agent-1',
        cloudInstance: { id: 'instance-1' }
      };

      const mockRequest = {
        end: jest.fn(),
        on: jest.fn()
      };

      https.request.mockReturnValue(mockRequest);

      agents.removeAgent('https://teamcity.example.com', 'Bearer token123', agent, false);

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'teamcity.example.com',
          path: '/app/rest/ui/cloud/instances/id:(instance-1)',
          method: 'DELETE'
        }),
        expect.any(Function)
      );
      expect(mockRequest.end).toHaveBeenCalled();
    });
  });
});