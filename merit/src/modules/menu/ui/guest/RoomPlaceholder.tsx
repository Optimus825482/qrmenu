/** Room QR pages arrive with P4; until then a room token shows this notice. */
export default function RoomPlaceholder({ message }: { message: string }) {
  return (
    <main className="g-unavailable" data-kind="room">
      <p>{message}</p>
    </main>
  );
}
