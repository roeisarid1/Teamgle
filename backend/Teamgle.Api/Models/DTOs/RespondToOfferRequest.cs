namespace Teamgle.Api.Models.DTOs;

public class RespondToOfferRequest
{
    /// <summary>true = accept (→ employee_request), false = decline (→ employee_request_canceled)</summary>
    public bool Accept { get; set; }
}
