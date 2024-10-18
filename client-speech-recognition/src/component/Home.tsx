import React, { useRef, useState } from "react";

const Home = () => {
  const [audioSocket, setAudioSocket] = useState<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [receivedData, setReceivedData] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // State to hold audio URL
  const audioChunksRef = useRef<Blob[]>([]);

  const connectWebSocket = () => {
    const socket = new WebSocket("ws://localhost:7001/api/speech-recognition/hung");

    socket.onopen = () => {
      console.log("Connected to WebSocket server");
      setAudioSocket(socket);
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.text && data.language) {
          setReceivedData((prevData) => [...prevData, data.text]);
        } else {
          console.error("Unexpected message format:", data);
        }
      } catch (error) {
        console.log(error);
      }
    };

    socket.onclose = () => {
      console.log("Disconnected from WebSocket server");
      setAudioSocket(null);
      setIsConnected(false);
    };
  };

  const disconnectWebSocket = () => {
    if (audioSocket) {
      audioSocket.close();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (audioSocket && audioSocket.readyState === WebSocket.OPEN && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          audioSocket.send(event.data); // Send audio chunk over WebSocket
        }
      };

      mediaRecorderRef.current.start(2000); // Start recording with chunk size of 100ms or every 100ms
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.onstop = () => {
        const audioUrl = URL.createObjectURL(
          new Blob(audioChunksRef.current, { type: "audio/webm" })
        );
        setAudioUrl(audioUrl);
      };
      setIsRecording(false);
    }
  };

  return (
    <div>
      <h1>Speech to Text Service</h1>
      <button onClick={isConnected ? disconnectWebSocket : connectWebSocket}>
        {isConnected ? "Disconnect" : "Connect"}
      </button>
      <br />
      <button onClick={startRecording} disabled={isRecording || !isConnected}>
        Start Streaming
      </button>
      <button onClick={stopRecording} disabled={!isRecording}>
        Stop Streaming
      </button>

      {audioUrl && (
        <div>
          <h2>Saved Audio Playback:</h2>
          <audio controls src={audioUrl} />
        </div>
      )}
      <h2>Received Audio Data:</h2>
      {receivedData ? (
        <pre>{JSON.stringify(Array.from(receivedData), null, 2)}</pre>
      ) : (
        <p>No audio data received.</p>
      )}
    </div>
  );
};
export default Home;
