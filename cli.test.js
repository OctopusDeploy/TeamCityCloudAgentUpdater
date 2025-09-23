const { spawn } = require('child_process');
const path = require('path');
const cli = require('./cli');

describe('CLI Commands', () => {
  const indexPath = path.join(__dirname, 'index.js');

  const runCommand = (args) => {
    return new Promise((resolve, reject) => {
      const process = spawn('node', [indexPath, ...args]);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  };

  describe('update-cloud-profile command', () => {
    it('should show error when required options are missing', async () => {
      const result = await runCommand(['update-cloud-profile']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('required option');
    });

    it('should show help with --help flag', async () => {
      const result = await runCommand(['update-cloud-profile', '--help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--token');
      expect(result.stdout).toContain('--server');
      expect(result.stdout).toContain('--image');
      expect(result.stdout).toContain('--cloudprofile');
      expect(result.stdout).toContain('--agentprefix');
      expect(result.stdout).toContain('--dryrun');
    });

    it('should validate required parameters', async () => {
      const result = await runCommand([
        'update-cloud-profile',
        '--token', 'test-token'
      ]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('required option');
    });
  });

  describe('remove-disabled-agents command', () => {
    it('should show error when required options are missing', async () => {
      const result = await runCommand(['remove-disabled-agents']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('required option');
    });

    it('should show help with --help flag', async () => {
      const result = await runCommand(['remove-disabled-agents', '--help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--token');
      expect(result.stdout).toContain('--server');
      expect(result.stdout).toContain('--dryrun');
    });

    it('should validate required parameters', async () => {
      const result = await runCommand([
        'remove-disabled-agents',
        '--token', 'test-token'
      ]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('required option');
    });
  });

  describe('General CLI', () => {
    it('should show version with --version flag', async () => {
      const result = await runCommand(['--version']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('1.0.0');
    });

    it('should show help with --help flag', async () => {
      const result = await runCommand(['--help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('TeamCity Cloud Agent Updater');
      expect(result.stdout).toContain('update-cloud-profile');
      expect(result.stdout).toContain('remove-disabled-agents');
    });

    it('should use update-cloud-profile as default command', async () => {
      const result = await runCommand([]);
      expect(result.code).not.toBe(0);
      // Should show error for missing required options from update-cloud-profile
      expect(result.stderr).toContain('required option');
    });
  });
});