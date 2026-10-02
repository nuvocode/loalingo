// Roleplay cast. Pure data, no browser APIs: goals and personas are English prompt text, topic titles live in i18n as roleplay.topics.<char>.<topic>.
import { parseBrief, type RehearsalBrief } from "./rehearsal.ts";
export type Topic = { id: string; goal: string };
/** Which parts and colors make up a character's cartoon bust. Parts are drawn in src/face/parts.tsx. */
export type FaceSpec = {
  head: "round" | "oval" | "square"; ears: "small" | "big"; eyes: "round" | "almond" | "sleepy";
  brows: "flat" | "arched" | "thick"; nose: "button" | "long" | "wide"; mouth: "small" | "wide" | "smile";
  hair: "short" | "bun" | "long" | "curly" | "ponytail" | "bald"; facialHair: "none" | "beard" | "mustache";
  outfit: "shirt" | "chef" | "coat" | "blazer" | "tshirt"; accessory: "none" | "glasses" | "chefHat" | "cap" | "earrings";
  skin: number; hairColor: number; // SKIN 0–4, HAIR 0–5; brows and facial hair use the hair color
};
export type Character = { name: string; gender: "f" | "m"; color: string; kokoroVoice: string; persona: string; face: FaceSpec; topics: Topic[] };

export const CHARACTERS = {
  mia: {
    name: "Mia", gender: "f", color: "var(--green)", kokoroVoice: "af_bella",
    face: { head: "oval", ears: "small", eyes: "almond", brows: "arched", nose: "button", mouth: "smile", hair: "bun", facialHair: "none", outfit: "shirt", accessory: "earrings", skin: 1, hairColor: 2 },
    persona: "A hotel receptionist who is warm, polished and endlessly polite. She smiles through every request, offers small extras unprompted and always confirms details back to the guest.",
    topics: [
      { id: "checkIn", goal: "check in and ask for a room" },
      { id: "roomProblem", goal: "report a problem with the room and ask for it to be fixed or changed" },
      { id: "recommendations", goal: "ask for local recommendations for dinner and sights" },
      { id: "lateCheckout", goal: "ask for a late checkout and settle the bill" },
      { id: "lostItem", goal: "report a lost item and describe it so the hotel can find it" },
    ],
  },
  kai: {
    name: "Kai", gender: "m", color: "var(--blue)", kokoroVoice: "am_puck",
    face: { head: "round", ears: "big", eyes: "round", brows: "thick", nose: "wide", mouth: "wide", hair: "short", facialHair: "mustache", outfit: "chef", accessory: "chefHat", skin: 3, hairColor: 0 },
    persona: "A restaurant chef who is passionate, jokey and a little dramatic about food. He talks with his hands, loves to tease guests about their choices and cannot resist explaining how a dish is made.",
    topics: [
      { id: "order", goal: "ask the chef for a recommendation and order" },
      { id: "allergies", goal: "explain a food allergy and check what is safe to eat" },
      { id: "cooking", goal: "cook a simple dish together in the kitchen, following the chef's instructions" },
      { id: "market", goal: "shop for ingredients at a market stall and ask about prices and freshness" },
    ],
  },
  nora: {
    name: "Nora", gender: "f", color: "var(--purple)", kokoroVoice: "af_nicole",
    face: { head: "oval", ears: "small", eyes: "round", brows: "flat", nose: "long", mouth: "small", hair: "ponytail", facialHair: "none", outfit: "coat", accessory: "none", skin: 0, hairColor: 4 },
    persona: "A family doctor who is calm, gentle and precise. She asks one clear question at a time, never rushes the patient and explains everything in plain words.",
    topics: [
      { id: "symptoms", goal: "describe symptoms to the doctor and answer her questions" },
      { id: "pharmacy", goal: "ask about a prescription, how to take the medicine and the dosage" },
      { id: "followUp", goal: "book a follow-up appointment at a time that suits you" },
      { id: "habits", goal: "talk about healthy habits like sleep, food and exercise and get advice" },
    ],
  },
  tom: {
    name: "Tom", gender: "m", color: "var(--gold-dark)", kokoroVoice: "bm_george",
    face: { head: "square", ears: "big", eyes: "sleepy", brows: "thick", nose: "wide", mouth: "small", hair: "bald", facialHair: "beard", outfit: "tshirt", accessory: "none", skin: 2, hairColor: 5 },
    persona: "A landlord who is gruff, practical and a bit stingy, but fair in the end. He speaks in short blunt sentences, loves to talk about the neighbourhood and drives a hard bargain.",
    topics: [
      { id: "viewing", goal: "view a flat and ask about its rooms, neighbourhood and what is included" },
      { id: "rent", goal: "negotiate the monthly rent and the deposit" },
      { id: "repair", goal: "report a broken heater or leaking tap and agree when it will be repaired" },
      { id: "rules", goal: "go through the house rules such as noise, guests and rubbish" },
    ],
  },
  emma: {
    name: "Emma", gender: "f", color: "var(--red)", kokoroVoice: "bf_emma",
    face: { head: "square", ears: "small", eyes: "almond", brows: "flat", nose: "long", mouth: "small", hair: "long", facialHair: "none", outfit: "blazer", accessory: "glasses", skin: 4, hairColor: 0 },
    persona: "A hiring manager who is sharp, brisk and businesslike. She wants concrete examples, asks tough follow-up questions and moves the interview along without small talk.",
    topics: [
      { id: "introduce", goal: "introduce yourself and say why you want this job" },
      { id: "strengths", goal: "talk about your strengths and weaknesses" },
      { id: "experience", goal: "describe your past work experience and one achievement" },
      { id: "salary", goal: "discuss salary and working hours and ask your own questions about the company" },
    ],
  },
  leo: {
    name: "Leo", gender: "m", color: "var(--green-dark)", kokoroVoice: "am_liam",
    face: { head: "round", ears: "small", eyes: "round", brows: "arched", nose: "button", mouth: "smile", hair: "curly", facialHair: "none", outfit: "tshirt", accessory: "cap", skin: 2, hairColor: 3 },
    persona: "A tour guide who is cheerful, chatty and a real show-off about his city. He loves fun facts and stories, speaks in long enthusiastic sentences and keeps the group moving.",
    topics: [
      { id: "tour", goal: "join a city tour and ask the guide about the sights" },
      { id: "directions", goal: "ask the guide for directions and how to get around the city" },
      { id: "tickets", goal: "buy museum tickets and ask about opening hours and prices" },
      { id: "dayTrip", goal: "plan a day trip together: where to go, how to get there and what to see" },
    ],
  },
} satisfies Record<string, Character>;
export type CharacterId = keyof typeof CHARACTERS;

/** Learner messages: the goal can't end a chat before MIN; MAX always ends it. */
export const CHAT_MIN_TURNS = 6, CHAT_MAX_TURNS = 12;

const FREE = "free";
export const FREE_GOAL = "have a natural conversation about: ";

/** `chat:<id>:<topicId>` or `chat:<id>:free:<text>`; `call:` for voice. */
export function talkId(voice: boolean, who: CharacterId, topic: string | { free: string }) {
  return `${voice ? "call" : "chat"}:${who}:${typeof topic === "string" ? topic : `${FREE}:${topic.free}`}`;
}

/** What App routes a chat/call/rehearse id to; `rehearse` only on a rehearsal (see rehearsal.ts). */
export type Talk = { voice: boolean; who: CharacterId; topic: { id?: string; goal: string }; rehearse?: RehearsalBrief };

export function parseTalkId(id: string): Talk | null {
  const [kind, who, ...rest] = id.split(":");
  if (kind === "rehearse") {
    const [mode, enc] = rest, brief = enc === undefined ? null : parseBrief(enc);
    if (!Object.prototype.hasOwnProperty.call(CHARACTERS, who) || (mode !== "chat" && mode !== "call") || rest.length !== 2 || !brief) return null;
    return { voice: mode === "call", who: who as CharacterId, topic: { goal: brief.about ?? "" }, rehearse: brief };
  }
  if ((kind !== "chat" && kind !== "call") || !Object.prototype.hasOwnProperty.call(CHARACTERS, who) || !rest.length) return null;
  const voice = kind === "call", c = who as CharacterId;
  if (rest[0] === FREE) {
    const text = rest.slice(1).join(":").trim();
    return text ? { voice, who: c, topic: { goal: FREE_GOAL + text } } : null;
  }
  const topic = CHARACTERS[c].topics.find((x) => x.id === rest.join(":"));
  return topic ? { voice, who: c, topic } : null;
}
