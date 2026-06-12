import {
  computeCommissions,
  getBogotaDayAndMinutes,
  isPeakHour,
} from './pricing.util';

describe('pricing.util', () => {
  describe('computeCommissions', () => {
    it('aplica peak fee y comisión de plataforma en hora pico', () => {
      const result = computeCommissions({
        orderAmount: 100000, // 1000 COP
        platformFeePercent: 5,
        peakFeePercent: 3,
        isPeak: true,
      });

      expect(result.peakFeeAmount).toBe(3000);
      expect(result.totalCharged).toBe(103000); // order + peak
      expect(result.platformFeeAmount).toBe(5000);
      expect(result.storePayoutAmount).toBe(95000); // order - platform fee
      expect(result.isPeakHour).toBe(true);
    });

    it('no cobra peak fee fuera de hora pico', () => {
      const result = computeCommissions({
        orderAmount: 100000,
        platformFeePercent: 5,
        peakFeePercent: 3,
        isPeak: false,
      });

      expect(result.peakFeeAmount).toBe(0);
      expect(result.totalCharged).toBe(100000);
      expect(result.storePayoutAmount).toBe(95000);
      expect(result.isPeakHour).toBe(false);
    });

    it('redondea al centavo entero más cercano', () => {
      const result = computeCommissions({
        orderAmount: 333,
        platformFeePercent: 5, // 16.65 -> 17
        peakFeePercent: 3, // 9.99 -> 10
        isPeak: true,
      });

      expect(result.peakFeeAmount).toBe(10);
      expect(result.platformFeeAmount).toBe(17);
      expect(result.totalCharged).toBe(343);
      expect(result.storePayoutAmount).toBe(316);
    });
  });

  describe('isPeakHour (zona America/Bogota)', () => {
    // 2026-06-15T17:00:00Z == 12:00 en Bogota (UTC-5).
    const date = new Date('2026-06-15T17:00:00Z');

    it('evalúa la hora en Bogota, no en UTC', () => {
      const { minutes } = getBogotaDayAndMinutes(date);
      expect(minutes).toBe(12 * 60); // 12:00 local Bogota
    });

    it('es hora pico si el día está incluido y la hora cae en la franja', () => {
      const { dayCode } = getBogotaDayAndMinutes(date);
      expect(
        isPeakHour(date, {
          peakDays: [dayCode],
          peakHoursStart: '11:30',
          peakHoursEnd: '14:00',
        }),
      ).toBe(true);
    });

    it('no es hora pico si la hora está fuera de la franja', () => {
      const { dayCode } = getBogotaDayAndMinutes(date);
      expect(
        isPeakHour(date, {
          peakDays: [dayCode],
          peakHoursStart: '13:00',
          peakHoursEnd: '14:00',
        }),
      ).toBe(false);
    });

    it('no es hora pico si el día no está en peakDays', () => {
      const { dayCode } = getBogotaDayAndMinutes(date);
      const otherDay = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].find(
        (d) => d !== dayCode,
      )!;
      expect(
        isPeakHour(date, {
          peakDays: [otherDay],
          peakHoursStart: '11:30',
          peakHoursEnd: '14:00',
        }),
      ).toBe(false);
    });

    it('no es hora pico si falta configuración', () => {
      expect(isPeakHour(date, {})).toBe(false);
      expect(
        isPeakHour(date, {
          peakDays: [],
          peakHoursStart: '11:30',
          peakHoursEnd: '14:00',
        }),
      ).toBe(false);
    });
  });
});
