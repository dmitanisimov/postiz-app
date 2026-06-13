import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';

export class TenChatProvider extends SocialAbstract implements SocialProvider {
  identifier = 'tenchat';
  name = 'TenChat';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;

  maxLength() {
    return 7000;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeId(17);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const code = Buffer.from(
      JSON.stringify({ connectedAt: new Date().toISOString() })
    ).toString('base64');

    return {
      url:
        `${frontendUrl}/integrations/social/tenchat` +
        `?state=${state}&code=${encodeURIComponent(code)}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    return {
      id: 'tenchat',
      name: 'TenChat',
      accessToken: process.env.TENCHAT_WEBHOOK_SECRET || 'tenchat',
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: '/icons/platforms/tenchat.svg',
      username: 'tenchat',
    };
  }

  private serializeDate(value?: Date | string) {
    if (!value) {
      return undefined;
    }

    return value instanceof Date ? value.toISOString() : value;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const webhookUrl = process.env.TENCHAT_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'TENCHAT_WEBHOOK_URL is not configured'
      );
    }

    const body = JSON.stringify({
      platform: this.identifier,
      postId: firstPost.id,
      integrationId: firstPost.integrationId || integration.id,
      organizationId: firstPost.organizationId || integration.organizationId,
      text: firstPost.message,
      media: firstPost.media || [],
      scheduledAt: this.serializeDate(firstPost.scheduledAt),
      createdAt: this.serializeDate(firstPost.createdAt),
      group: firstPost.group,
      settings: firstPost.settings || {},
    });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': process.env.TENCHAT_WEBHOOK_SECRET || '',
      },
      body,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new BadBody(
        this.identifier,
        responseText || '{}',
        body,
        `TenChat webhook failed with status ${response.status}`
      );
    }

    let responseBody: any = {};
    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseBody = {};
    }

    return [
      {
        id: firstPost.id,
        postId: String(responseBody.postId || responseBody.id || firstPost.id),
        releaseURL: responseBody.releaseURL || responseBody.url || '',
        status: responseBody.status || 'completed',
      },
    ];
  }
}
