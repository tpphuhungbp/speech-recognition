import express from "express";
import cors from "cors";
import http, { Server } from "http";
import wssNotification from "./utils/ws";

const app = express();
app.disable("x-powered-by");

app.use(cors());
app.use(express.json());

const port = 7001;

app.set("port", port);
app.get("/", (_req, res) => {
  res.send("Server đang hoạt động");
});
const server: Server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/speech-recognition/")) {
    wssNotification.handleUpgrade(req, socket, head, (ws) => {
      wssNotification.emit("connection", ws, req);
    });
  } else {
    socket.end("HTTP/1.1 405 Method không được chấp nhận\r\n\r\n");
  }
});

server
  .listen(port, () => {
    console.log(`Server is listening at port: ${port}`);
  })
  .on("error", (_error: Error) => {
    return console.log("Error: ", _error.message);
  });

/**
 * Event listener for HTTP server "error" event.
 */

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.syscall !== "listen") {
    throw error;
  }
  const bind = typeof port === "string" ? `Pipe ${port}` : `Port ${port}`;

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      // eslint-disable-next-line no-console
      console.error(`${bind} yêu cầu quyền cao hơn`);
      process.exit(1);
      break;
    case "EADDRINUSE":
      // eslint-disable-next-line no-console
      console.error(`${bind} đang được sử dụng`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Catch any missed exception
process.on("unhandledRejection", async (reason, promise) => {
  const error = await promise.catch((err) => err?.stack || err);
  console.log(`Unhandled Rejection at: ${error} reason: ${reason}`, 0);
});
