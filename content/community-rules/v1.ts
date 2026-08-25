export const COMMUNITY_RULES_V1 = {
  version: 1,
  publishedOn: "2026-08-25",
  title: "Huddle community rules",
  introduction:
    "Huddle is for safe, honest sports gatherings. Team rivalry never excuses abuse or danger.",
  sections: [
    {
      title: "Respect people",
      points: [
        "No threats, planned fights, violence, harassment, stalking, sexual misconduct, hate, or discriminatory abuse.",
        "Do not evade another member’s block or a group or platform ban.",
      ],
    },
    {
      title: "Protect privacy",
      points: [
        "Never expose or share a home address or other private information without permission.",
        "Do not ask for phone numbers, financial or health data, a home address, sexual orientation, or full legal identity in applications or attendance notes.",
      ],
    },
    {
      title: "Host honestly",
      points: [
        "State the real host, place type, expected activity, costs, rules, and commercial affiliations.",
        "The named host or venue contact must be present. Do not bring unapproved guests or plus-ones.",
      ],
    },
    {
      title: "Keep gatherings lawful and safe",
      points: [
        "No impersonation, venue fraud, scams, illegal goods, weapons, or dangerous activity.",
        "Huddle is not an emergency service. Contact local emergency services when someone is in immediate danger.",
      ],
    },
  ],
} as const;
