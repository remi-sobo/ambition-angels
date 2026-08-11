import type { Metadata } from "next";
import RoomScreen from "./RoomScreen";

export const metadata: Metadata = {
  title: "Room — What Are You Built For",
  robots: { index: false, follow: false },
};

export default function RoomPage({
  params,
  searchParams,
}: {
  params: { room: string };
  searchParams: { host?: string };
}) {
  return <RoomScreen roomCode={params.room} hostToken={searchParams.host ?? null} />;
}
