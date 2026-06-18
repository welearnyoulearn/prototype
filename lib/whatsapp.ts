// Meta WhatsApp Cloud API client
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages
const META_API_VERSION = 'v19.0'
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export type WhatsAppTemplateMessage = {
  phoneNumber: string   // recipient, digits only with country code e.g. "919876543210"
  templateName: string
  languageCode: string  // e.g. 'en' or 'en_US'
  bodyParams: string[]
  headerParams?: string[]
  callbackData?: string
}

export async function sendWhatsAppTemplate(
  accessToken: string,
  phoneNumberId: string,
  message: WhatsAppTemplateMessage
): Promise<{ messageId: string | null; error: string | null }> {
  try {
    const components: object[] = []

    if (message.headerParams && message.headerParams.length > 0) {
      components.push({
        type: 'header',
        parameters: message.headerParams.map(v => ({ type: 'text', text: v })),
      })
    }

    if (message.bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: message.bodyParams.map(v => ({ type: 'text', text: v })),
      })
    }

    const res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.phoneNumber,
        type: 'template',
        template: {
          name: message.templateName,
          language: { code: message.languageCode },
          components,
        },
        ...(message.callbackData ? { biz_opaque_callback_data: message.callbackData } : {}),
      }),
    })

    const data = await res.json()

    if (data.messages?.[0]?.id) {
      return { messageId: data.messages[0].id, error: null }
    }

    return { messageId: null, error: data.error?.message || 'Failed to send WhatsApp message' }
  } catch (err) {
    return { messageId: null, error: err instanceof Error ? err.message : 'Network error' }
  }
}
