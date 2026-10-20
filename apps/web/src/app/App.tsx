import { BrowserRouter, Route, Routes } from "react-router";
import { CreatePage } from "../routes/CreatePage";
import { HomePage } from "../routes/HomePage";
import { JoinPage } from "../routes/JoinPage";
import { NotFoundPage } from "../routes/NotFoundPage";
import { RoomPage } from "../routes/RoomPage";
import { ErrorBoundary } from "./ErrorBoundary";

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/r/:code" element={<RoomPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
