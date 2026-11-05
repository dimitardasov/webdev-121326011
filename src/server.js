const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`Club Events is listening on port ${port}. In a codespace, open the forwarded port ${port}.`);
});
