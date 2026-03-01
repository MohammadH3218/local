import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  listAppointments(
    @CompanyId() companyId: string,
    @Query('limit') limit?: string,
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
  ) {
    return this.appointments.listAppointments(companyId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    });
  }

  @Get('range')
  listAppointmentsInRange(
    @CompanyId() companyId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startMs = start ? Date.parse(start) : NaN;
    const endMs = end ? Date.parse(end) : NaN;
    return this.appointments.listAppointmentsInRange(companyId, startMs, endMs).then((appointments) => ({
      appointments,
    }));
  }

  @Post()
  createAppointment(@CompanyId() companyId: string, @Body() body: any) {
    return this.appointments.createAppointment(companyId, body);
  }

  @Get(':appointmentId')
  getAppointment(
    @CompanyId() companyId: string,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.appointments.getAppointment(companyId, appointmentId);
  }

  @Put(':appointmentId')
  updateAppointment(
    @CompanyId() companyId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: any,
  ) {
    return this.appointments.updateAppointment(companyId, appointmentId, body);
  }

  @Delete(':appointmentId')
  deleteAppointment(@CompanyId() companyId: string, @Param('appointmentId') appointmentId: string) {
    return this.appointments.deleteAppointment(companyId, appointmentId);
  }
}
