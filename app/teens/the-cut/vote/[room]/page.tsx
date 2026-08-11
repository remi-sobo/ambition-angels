import type { Metadata } from "next";
import VoteScreen from "./VoteScreen";

// The phone in a student's hand. Noindex like every room screen.
export const metadata: Metadata = {
  title: "The Cut · vote",
  robots: { index: false, follow: false },
};

export default function CutVotePage({ params }: { params: { room: string } }) {
  return <VoteScreen roomCode={params.room} />;
}
