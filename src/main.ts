import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/logger/structured.logger';
import { setupAppInsights } from './common/telemetry/app-insights';
import { swaggerCustomCss, swaggerCustomJs } from './config/swagger-custom-ui';
import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SERVICE_NAME = 'financial-service';
const LOCK_FILE = path.join(os.tmpdir(), `${SERVICE_NAME}-swagger.lock`);
const HOT_RELOAD_WINDOW_MS = 10_000;

function isBrowserRunning(): boolean {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /nh', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      return /chrome\.exe|msedge\.exe|firefox\.exe|brave\.exe|opera\.exe/i.test(
        out,
      );
    }
    const out = execSync('ps aux', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /Google Chrome|Safari|firefox|Brave Browser|Chromium/i.test(out);
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, { windowsHide: true });
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

function openSwaggerIfBrowserOpen(url: string): void {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const { timestamp } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8')) as {
        timestamp: number;
      };
      if (Date.now() - timestamp < HOT_RELOAD_WINDOW_MS) {
        return;
      }
    } catch {
      // lock file corrupted or old format — proceed
    }
  }

  if (!isBrowserRunning()) return;

  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ timestamp: Date.now() }),
    'utf-8',
  );
  openBrowser(url);
}

function cleanupLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

process.on('SIGTERM', () => {
  cleanupLock();
  process.exit(0);
});

process.on('SIGINT', () => {
  cleanupLock();
  process.exit(0);
});

async function bootstrap() {
  // Inicializa Application Insights antes de crear la app para que el SDK pueda
  // instrumentar HTTP/dependencias. No-op si no hay connection string (local).
  setupAppInsights();

  const app = await NestFactory.create(AppModule, { logger: new StructuredLogger() });

  // CORS: el frontend (ECIExpress) llama a este servicio directamente en desarrollo
  // (sin API Gateway) enviando el header x-user-id. En producción restringir el origen.
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Financial Service')
    .setDescription('Financial Service API documentation')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    customCss: swaggerCustomCss,
    customJsStr: swaggerCustomJs,
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3004;
  await app.listen(port);

  openSwaggerIfBrowserOpen(`http://localhost:${port}/api`);
}
void bootstrap();
