import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ToolsAuthGuard } from '../../common/guards/tools-auth.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { HoldSlotDto } from './dto/hold-slot.dto';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { KnowledgeSearchDto } from './dto/knowledge-search.dto';
import { ResolveTenantDto } from './dto/resolve-tenant.dto';
import { SaveCallDto } from './dto/save-call.dto';
import { SaveRecordingDto } from './dto/save-recording.dto';
import { CheckServiceAreaDto } from './dto/check-service-area.dto';
import { ListAppointmentsByPhoneDto } from './dto/list-appointments.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { StartCallDto } from './dto/start-call.dto';
import { SendBookingLinkDto } from './dto/send-booking-link.dto';
import { RealtimeToolsService } from './realtime-tools.service';

@Controller()
@Public()
@UseGuards(ToolsAuthGuard)
export class RealtimeToolsController {
  constructor(private readonly tools: RealtimeToolsService) { }

  @Post('tenant/resolve')
  resolveTenant(@Body() dto: ResolveTenantDto) {
    const toNumber = dto.to_number ?? dto.dialedNumber;
    if (!toNumber) throw new BadRequestException('to_number is required');
    return this.tools.resolveTenant(toNumber);
  }

  @Post('tools/create_lead')
  createLead(@Body() dto: CreateLeadDto) {
    return this.tools.createLead(dto);
  }

  @Post('tools/start_call')
  startCall(@Body() dto: StartCallDto) {
    return this.tools.startCall(dto);
  }

  @Post('tools/save_call')
  saveCall(@Body() dto: SaveCallDto) {
    return this.tools.saveCall(dto);
  }

  @Post('tools/save_recording')
  saveRecording(@Body() dto: SaveRecordingDto) {
    return this.tools.saveRecording(dto);
  }

  @Post('tools/get_availability')
  getAvailability(@Body() dto: GetAvailabilityDto) {
    return this.tools.getAvailability(dto);
  }

  @Post('tools/create_booking')
  createBooking(@Body() dto: CreateBookingDto) {
    return this.tools.createBooking(dto);
  }

  @Post('tools/hold_slot')
  holdSlot(@Body() dto: HoldSlotDto) {
    return this.tools.holdSlot(dto);
  }

  @Post('tools/knowledge_search')
  knowledgeSearch(@Body() dto: KnowledgeSearchDto) {
    return this.tools.knowledgeSearch(dto);
  }

  @Post('tools/check_service_area')
  checkServiceArea(@Body() dto: CheckServiceAreaDto) {
    return this.tools.checkServiceArea(dto.company_id, dto.zip);
  }

  @Post('tools/list_appointments_by_phone')
  listAppointmentsByPhone(@Body() dto: ListAppointmentsByPhoneDto) {
    return this.tools.listAppointmentsByPhone(dto);
  }

  @Post('tools/cancel_appointment')
  cancelAppointment(@Body() dto: CancelAppointmentDto) {
    return this.tools.cancelAppointment(dto);
  }

  @Post('tools/reschedule_appointment')
  rescheduleAppointment(@Body() dto: RescheduleAppointmentDto) {
    return this.tools.rescheduleAppointment(dto);
  }

  @Post('tools/send_booking_link')
  sendBookingLink(@Body() dto: SendBookingLinkDto) {
    return this.tools.sendBookingLink(dto);
  }
}
