// PM2 配置(开发/调试用)。生产部署在 Render 上用 npm start。
module.exports = {
  apps: [
    {
      name: 'archlearn',
      script: 'npx',
      args: 'tsx src/server.ts',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
