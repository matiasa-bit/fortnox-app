import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export default function SimpleTemplate({ subject = "", body = "", recipientName = "", senderName = "Saldoredo" }) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif", margin: 0, padding: "32px" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto" }}>
          <Section>
            {recipientName && (
              <Text style={{ fontSize: 15, color: "#1a2e3b", marginBottom: 16 }}>
                Hej {recipientName},
              </Text>
            )}
            {body.split("\n").map((line, i) => (
              <Text key={i} style={{ fontSize: 14, color: "#334155", lineHeight: 1.8, margin: "0 0 8px" }}>
                {line || "\u00A0"}
              </Text>
            ))}
            <Text style={{ fontSize: 14, color: "#334155", marginTop: 24 }}>
              Med vänliga hälsningar,<br />{senderName}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
