import { Router } from 'express';
import { getAnalytics, type AnalyticsPeriod } from '../repo.js';
import { HttpError } from '../http.js';

export const analyticsRouter = Router();

analyticsRouter.get('/', (req, res) => {
  const period = req.query.period;
  if (period !== 'day' && period !== 'week' && period !== 'month' && period !== 'year') {
    throw new HttpError(400, 'Período inválido');
  }
  res.json(getAnalytics(period as AnalyticsPeriod));
});
