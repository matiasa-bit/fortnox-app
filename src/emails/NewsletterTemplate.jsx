import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export default function NewsletterTemplate({ subject = "", body = "", recipientName = "", senderName = "Saldoredo" }) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: "#f4f7fa", fontFamily: "Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, maxWidth: 600, margin: "0 auto", overflow: "hidden" }}>
          {/* Header */}
          <Section style={{ backgroundColor: "#0f1923", padding: "24px 32px" }}>
            <Text style={{ color: "#00c97a", fontSize: 22, fontWeight: 700, margin: 0 }}>{senderName}</Text>
          </Section>

          {/* Body */}
          <Section style={{ padding: "32px 32px 24px" }}>
            {recipientName && (
              <Text style={{ fontSize: 15, color: "#1a2e3b", marginBottom: 16 }}>
                Hej {recipientName},
              </Text>
            )}
            {body.split("\n").map((line, i) => (
              <Text key={i} style={{ fontSize: 14, color: "#334155", lineHeight: 1.7, margin: "0 0 8px" }}>
                {line || "\u00A0"}
              </Text>
            ))}
          </Section>

          <Hr style={{ borderColor: "#e2e8f0", margin: "0 32px" }} />

          {/* Footer */}
          <Section style={{ padding: "16px 32px" }}>
            <Text style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              Det här mailet skickades från {senderName}. Om du inte vill få fler utskick, kontakta oss direkt.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
