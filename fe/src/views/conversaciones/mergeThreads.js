import { priorityRank } from "../../components/PriorityBadge";

export function packRecados(list) {
  const unread = list.filter((r) => !r.read).length;
  const topPriority = list.reduce(
    (best, r) => (priorityRank(r.priority) < priorityRank(best) ? r.priority : best),
    "baja"
  );
  const recados = [...list].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || new Date(b.createdAt) - new Date(a.createdAt)
  );
  return { recados, unread, topPriority, hasRecados: recados.length > 0 };
}

export function mergeThreads(contactsWithMsgs, recados) {
  const recadosByContact = new Map();
  for (const r of recados) {
    if (!recadosByContact.has(r.contactId)) recadosByContact.set(r.contactId, []);
    recadosByContact.get(r.contactId).push(r);
  }

  const fromMsgs = contactsWithMsgs.map((c) => {
    const packed = packRecados(recadosByContact.get(c.contactId) || []);
    return {
      contactId: c.contactId,
      contactName: c.contactName,
      lastMessage: c.lastMessage,
      lastAt: new Date(c.lastAt).getTime(),
      avatarUrl: c.avatarUrl || "",
      ...packed,
    };
  });

  const seen = new Set(fromMsgs.map((c) => c.contactId));
  const extras = [];
  for (const [contactId, list] of recadosByContact) {
    if (seen.has(contactId)) continue;
    const latest = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    extras.push({
      contactId,
      contactName: latest.contactName || contactId,
      lastMessage: latest.content,
      lastAt: new Date(latest.createdAt).getTime(),
      avatarUrl: "",
      ...packRecados(list),
    });
  }

  return [...fromMsgs, ...extras].sort((a, b) => b.lastAt - a.lastAt);
}
