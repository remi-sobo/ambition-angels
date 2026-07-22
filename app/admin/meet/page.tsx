import { redirect } from "next/navigation";

// The booking admin moved into the consolidated Meetings section — one
// sidebar item with Overview / Connections / Bookings / Booking page tabs.
// This route stays only so old bookmarks and PWA shortcuts keep working.
export default function MeetRedirect() {
  redirect("/admin/meetings/booking-page");
}
