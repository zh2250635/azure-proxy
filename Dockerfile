# 使用nodejs v20.11.1作为基础镜像
FROM node:20.11.1

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json到工作目录
COPY package*.json ./

# 安装依赖, 清理缓存
RUN npm install && npm cache clean --force

# 复制所有文件到工作目录
COPY . .

ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]