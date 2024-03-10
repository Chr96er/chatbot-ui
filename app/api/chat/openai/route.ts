import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  const latestMessage = messages[messages.length - 1].content

  async function generateImage(
    latestMessage: string,
    messages: any[],
    chatSettings: ChatSettings
  ) {
    try {
      const profile = await getServerProfile()

      checkApiKey(profile.openai_api_key, "OpenAI")

      const openai = new OpenAI({
        apiKey: profile.openai_api_key || "",
        organization: profile.openai_organization_id
      })

      messages[messages.length - 1].content =
        "Take this prompt and turn it into a great prompt to generate a Dall-E image. " +
        "Make it extremely elaborate and give it plenty of color: \
        " +
        latestMessage

      const imageGenerationPromptStream = await openai.chat.completions.create({
        model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
        messages: messages as ChatCompletionCreateParamsBase["messages"],
        temperature: chatSettings.temperature,
        max_tokens:
          CHAT_SETTING_LIMITS[chatSettings.model].MAX_TOKEN_OUTPUT_LENGTH,
        stream: true
      })

      var imageGenerationPrompt = ""

      for await (const chunk of imageGenerationPromptStream) {
        imageGenerationPrompt += chunk.choices[0]?.delta?.content || ""
      }

      // Todo CHO20240112: Get those image generation parameters from the UI settings
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: imageGenerationPrompt,
        n: 1,
        quality: "hd",
        response_format: "url"
      })

      return new Response(
        imageGenerationPrompt +
          " \
      " +
          response.data[0].url,
        {
          status: 200
        }
      )
    } catch (error: any) {
      const errorMessage =
        error.error?.message || "An unexpected error occurred"
      const errorCode = error.status || 500
      return new Response(JSON.stringify({ message: errorMessage }), {
        status: errorCode
      })
    }
  }

  async function createCompletion(messages: any[], chatSettings: ChatSettings) {
    try {
      const profile = await getServerProfile()

      checkApiKey(profile.openai_api_key, "OpenAI")

      const openai = new OpenAI({
        apiKey: profile.openai_api_key || "",
        organization: profile.openai_organization_id
      })

      const response = await openai.chat.completions.create({
        model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
        messages: messages as ChatCompletionCreateParamsBase["messages"],
        temperature: chatSettings.temperature,
        max_tokens:
          CHAT_SETTING_LIMITS[chatSettings.model].MAX_TOKEN_OUTPUT_LENGTH,
        stream: true
      })

      const stream = OpenAIStream(response)

      return new StreamingTextResponse(stream)
    } catch (error: any) {
      const errorMessage =
        error.error?.message || "An unexpected error occurred"
      const errorCode = error.status || 500
      return new Response(JSON.stringify({ message: errorMessage }), {
        status: errorCode
      })
    }
  }

  if (
    typeof latestMessage === "string" &&
    latestMessage.startsWith("Generate an image")
  ) {
    return generateImage(latestMessage, messages, chatSettings)
  } else {
    return createCompletion(messages, chatSettings)
  }
}
