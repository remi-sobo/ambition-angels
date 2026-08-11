import type { Metadata } from "next";
import BoardScreen from "./BoardScreen";

// The projected board (and, with ?solo=1, the one-player board). Noindex
// like every room screen — a live room code is not a landing page.
export const metadata: Metadata = {
  title: "The Cut — board",
  robots: { index: false, follow: false },
};

export default function CutRoomPage({ params }: { params: { room: string } }) {
  return <BoardScreen roomCode={params.room} />;
}
