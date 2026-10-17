// React hook: live name + photo for a list of people, as { [uid]: { name, photoURL } }.
import { useEffect, useState } from "react";
import { watchPublicProfile } from "./data";

export function usePeople(uids) {
  const key = [...new Set(uids.filter(Boolean))].sort().join(",");
  const [people, setPeople] = useState({});

  useEffect(() => {
    if (!key) return;
    const stops = key.split(",").map((uid) =>
      watchPublicProfile(uid, (person) => setPeople((prev) => ({ ...prev, [uid]: person })))
    );
    return () => stops.forEach((stop) => stop());
  }, [key]);

  return people;
}
