// React hook: name + photo for a list of people, as { [uid]: { name, photoURL } }.
// Each person is loaded once per page load (photos rarely change).
import { useEffect, useState } from "react";
import { getPublicProfile } from "./data";

export function usePeople(uids) {
  const key = [...new Set(uids.filter(Boolean))].sort().join(",");
  const [people, setPeople] = useState({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    for (const uid of key.split(",")) {
      getPublicProfile(uid).then((person) => {
        if (!cancelled) setPeople((prev) => ({ ...prev, [uid]: person }));
      });
    }
    return () => { cancelled = true; };
  }, [key]);

  return people;
}
