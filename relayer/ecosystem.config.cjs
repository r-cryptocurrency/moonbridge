module.exports = {
  apps: [{
    name: 'moonbridge-relayer',
    script: './src/index-v2.js',
    cwd: '/opt/moonbridge/relayer',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/root/.pm2/logs/moonbridge-relayer-error.log',
    out_file: '/root/.pm2/logs/moonbridge-relayer-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
