import { useRoomState } from "../rooms/room-context";
import { GamePicker, SettingsPanel, StartBar } from "./GameSetup";
import { PlayerList } from "./PlayerList";
import { RoomCodeCard } from "./RoomCodeCard";

export function Lobby({ onOpenRules }: { onOpenRules: () => void }) {
  const { room } = useRoomState();
  if (!room) return null;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-safe pt-4 lg:max-w-5xl lg:pt-8">
      <div className="flex flex-col gap-6 pb-6 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-6">
          <RoomCodeCard code={room.code} />
          <PlayerList />
        </div>
        <div className="flex flex-col gap-6">
          <GamePicker />
          <SettingsPanel onOpenRules={onOpenRules} />
        </div>
      </div>
      <StartBar />
    </div>
  );
}
