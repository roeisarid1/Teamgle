using System.ComponentModel.DataAnnotations;

namespace Teamgle.Api.Models.DTOs;

public class CreateEquipmentRequest
{
    [Required]
    [MaxLength(255)]
    public string  Name     { get; set; } = "";

    public int     Quantity { get; set; } = 1;

    [MaxLength(5000)]
    public string? Notes    { get; set; }
}
