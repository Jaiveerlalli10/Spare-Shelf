/** Giver's note: the receiver can see your live location while you head to the pickup spot (with Pause). */
export default function LiveNote({ liveShare, otherId, otherName }) {
  if (!liveShare) return null;
  const isPaused = liveShare.paused.includes(otherId);
  return (
    <span className="live-note">
      <span>
        {isPaused
          ? <>⏸ Live location paused for {otherName}.</>
          : liveShare.liveOn
            ? <>📡 {otherName} can see your live location until the hand-off is done.</>
            : <>📡 Turn on location (see the map) so {otherName} can see you coming.</>}
      </span>
      <button className="btn ghost small" onClick={() => liveShare.onTogglePause(otherId)}>{isPaused ? "Resume" : "Pause"}</button>
    </span>
  );
}
