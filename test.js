const tls = require('tls');

const hostname = 'testvl.scchat.dpdns.org';
const options = {
  host: hostname,
  port: 443,
  servername: hostname,
  rejectUnauthorized: false, // 如果是自签名或测试环境可加此行
};

const socket = tls.connect(options, () => {
  const cert = socket.getPeerCertificate();
  if (cert) {
    // 去掉冒号，输出纯十六进制字符串
    console.log(cert.fingerprint.replace(/:/g, ''));
    console.log(cert.fingerprint256.replace(/:/g, ''));
  }
  socket.end();
});

socket.on('error', (err) => {
  console.error('错误:', err.message);
});
