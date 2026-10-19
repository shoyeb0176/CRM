import * as React from 'react'

import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'

export interface DocumentEmailProps {
  kind: 'Quote' | 'Invoice'
  number: string
  orgName: string
  message?: string
  currency: string
  meta: string
  lines: { description: string; quantity: number; unit_price: number; line_total: number }[]
  totals: [string, number][]
}

const money = (n: number, ccy: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy }).format(Number(n) || 0)

export const DocumentEmail = (p: DocumentEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${p.kind} ${p.number} from ${p.orgName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{`${p.kind} ${p.number}`}</Heading>
        <Text style={muted}>{`From ${p.orgName}${p.meta ? ` · ${p.meta}` : ''}`}</Text>
        {p.message && <Text style={text}>{p.message}</Text>}
        <Section>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th align="left" style={th}>Description</th>
                <th align="right" style={th}>Qty</th>
                <th align="right" style={th}>Price</th>
                <th align="right" style={th}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={i}>
                  <td style={td}>{l.description}</td>
                  <td align="right" style={td}>{Number(l.quantity)}</td>
                  <td align="right" style={td}>{money(l.unit_price, p.currency)}</td>
                  <td align="right" style={td}>{money(l.line_total, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: '12px', fontSize: '13px' }}>
            <tbody>
              {p.totals.map(([label, v], i) => {
                const weight = i === p.totals.length - 1 ? 'bold' : 'normal'
                return (
                  <tr key={label}>
                    <td align="right" style={{ padding: '2px 12px', color: '#55575d', fontWeight: weight }}>{label}</td>
                    <td align="right" width="120" style={{ padding: '2px 0', fontWeight: weight }}>{money(v, p.currency)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
        <Hr style={{ borderColor: '#e5e5e5', margin: '28px 0 12px' }} />
        <Text style={footer}>{`Reply to this email if you have any questions about this ${p.kind.toLowerCase()}.`}</Text>
      </Container>
    </Body>
  </Html>
)

export default DocumentEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#111111' }
const container = { padding: '20px 25px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 4px' }
const text = { fontSize: '14px', color: '#333333', lineHeight: '1.5', margin: '16px 0', whiteSpace: 'pre-line' as const }
const muted = { fontSize: '13px', color: '#55575d', margin: '0 0 12px' }
const th = { borderBottom: '1px solid #d4d4d4', padding: '6px 4px', fontSize: '11px', color: '#737373', textTransform: 'uppercase' as const }
const td = { borderBottom: '1px solid #f0f0f0', padding: '6px 4px', verticalAlign: 'top' as const }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
